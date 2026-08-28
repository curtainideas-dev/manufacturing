import { useState, useEffect } from 'react'
import { XIcon, CheckIcon } from './Icons'
import { stockKey, findSuitableBars, packCuts, buildBarDeductions, countCutSlots } from '../lib/stockEngine'
import { nestGroups, piecesFitting } from '../lib/fabricEngine'
import { fmtQty } from '../lib/bomEngine'

/**
 * Label / width / length for a fabric offcut about to be saved.
 *
 * The width is editable rather than fixed at what the nesting calculated,
 * because whoever's at the table is the one who knows what actually came off
 * the roll — a strip that tore, or one they trimmed square before rolling it.
 * What gets stored has to be what's physically on the shelf, or the next job
 * matches a cut to a piece that won't take it.
 */
const OffcutFields = ({ value, defaultWidth, defaultLength, onLabel, onWidth, onLength }) => (
  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
    <input className="field-input" style={{ flex: 2, fontSize: 13 }} placeholder="Label"
      value={value?.label || ''} onChange={e => onLabel(e.target.value)} />
    <div style={{ position: 'relative', flex: 1 }}>
      <input className="field-input" type="number" min="1" step="1"
        style={{ fontSize: 13, paddingRight: 44 }}
        value={value?.roll_width_mm ?? defaultWidth}
        onChange={e => onWidth(Number(e.target.value))} />
      <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--warm-300)', pointerEvents: 'none' }}>mm w</span>
    </div>
    <div style={{ position: 'relative', flex: 1 }}>
      <input className="field-input" type="number" min="1" step="1"
        style={{ fontSize: 13, paddingRight: 44 }}
        value={value?.length_mm ?? defaultLength}
        onChange={e => onLength(Number(e.target.value))} />
      <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--warm-300)', pointerEvents: 'none' }}>mm l</span>
    </div>
  </div>
)

export default function DeductStockModal({ open, job, jobSummary, jobMovements, stockMap, stockBars, onClose, onDeduct, saving }) {
  const [lineStatus,    setLineStatus]    = useState({})
  // Each cut gets its own source — key -> { "<binIdx>.<cutInBinIdx>": sourceId }
  // sourceId is '__full_bar__' or a specific offcut's id. Cuts in the same bin
  // that both pick '__full_bar__' share one bar; anything else (a specific
  // offcut) is sourced independently, so offcuts and a full bar can mix.
  const [barSelections, setBarSelections] = useState({})
  // Which piece of stock each fabric BAND is cut from — key -> { "<bandIdx>": pieceId }
  // pieceId is '__new_roll__' or a specific roll/offcut's id. Several bands can
  // name the same piece; the lengths they take off it are summed.
  const [fabricSelections, setFabricSelections] = useState({})
  // Leftover "save as offcut" choices — key -> { "cut:<selKey>"|"bar:<binIdx>"|
  // "side:<bandIdx>"|"tail:<pieceId>": { add, label, length_mm, roll_width_mm } }
  const [offcutData,    setOffcutData]    = useState({})
  const [qtyOverride,   setQtyOverride]   = useState({}) // key -> qty typed by the picker

  useEffect(() => {
    if (!job?.id) return
    const deductedKeys = new Set(
      (jobMovements || []).map(m => stockKey(m.component_id, m.colour_variant))
    )
    const initial = {}
    deductedKeys.forEach(k => { initial[k] = 'done' })
    setLineStatus(initial)
    setBarSelections({})
    setFabricSelections({})
    setOffcutData({})
    setQtyOverride({})
  }, [job?.id, jobMovements])

  if (!open || !jobSummary) return null

  const toggleLine = (key) => {
    setLineStatus(prev => {
      if (prev[key] === 'done') return prev
      return { ...prev, [key]: prev[key] === 'picked' ? 'pending' : 'picked' }
    })
  }

  const skipLine = (key) => {
    setLineStatus(prev => {
      if (prev[key] === 'done') return prev
      return { ...prev, [key]: prev[key] === 'skipped' ? 'pending' : 'skipped' }
    })
  }

  // selKey identifies one individual cut: "<binIdx>.<cutInBinIdx>"
  const selectSource = (key, selKey, sourceId, totalCuts) => {
    setBarSelections(prev => {
      const next = { ...(prev[key] || {}) }
      // A specific offcut can only supply one cut — drop it from any other
      // cut in this line that had it selected.
      if (sourceId !== '__full_bar__') {
        Object.keys(next).forEach(k => { if (k !== selKey && next[k] === sourceId) delete next[k] })
      }
      next[selKey] = sourceId
      if (Object.values(next).filter(Boolean).length === totalCuts) {
        setLineStatus(ls => ls[key] !== 'done' ? { ...ls, [key]: 'picked' } : ls)
      }
      return { ...prev, [key]: next }
    })
  }

  const toggleOffcut = (key, leftoverKey, defaultLengthMm, defaultWidthMm = null) => {
    setOffcutData(prev => {
      const lineData = { ...(prev[key] || {}) }
      const current  = lineData[leftoverKey]
      lineData[leftoverKey] = {
        ...current,
        add:       !current?.add,
        length_mm: current?.length_mm ?? Math.round(defaultLengthMm),
        // Only fabric carries a width; a track offcut leaves it null.
        roll_width_mm: current?.roll_width_mm ?? (defaultWidthMm != null ? Math.round(defaultWidthMm) : null),
      }
      return { ...prev, [key]: lineData }
    })
  }

  const setOffcutWidth = (key, leftoverKey, roll_width_mm) => {
    setOffcutData(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [leftoverKey]: { ...(prev[key]?.[leftoverKey]), roll_width_mm } },
    }))
  }

  /**
   * Point one band at a piece of stock.
   *
   * Unlike a bar offcut, a fabric piece is NOT claimed exclusively — several
   * bands can be cut off one roll, one after another, so the same piece stays
   * offerable. What stops it being over-committed is the length check at the
   * point of selection, which counts what the other bands already took.
   */
  const selectFabricSource = (key, bandIdx, pieceId, totalBands) => {
    setFabricSelections(prev => {
      const next = { ...(prev[key] || {}), [bandIdx]: pieceId }
      if (Object.values(next).filter(Boolean).length === totalBands) {
        setLineStatus(ls => ls[key] !== 'done' ? { ...ls, [key]: 'picked' } : ls)
      }
      return { ...prev, [key]: next }
    })
  }

  const setOffcutLabel = (key, leftoverKey, label) => {
    setOffcutData(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [leftoverKey]: { ...(prev[key]?.[leftoverKey]), label } },
    }))
  }

  const setOffcutLength = (key, leftoverKey, length_mm) => {
    setOffcutData(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [leftoverKey]: { ...(prev[key]?.[leftoverKey]), length_mm } },
    }))
  }

  // Quantity actually deducted for a line — the BOM figure unless overridden
  const effectiveQty = (key, requiredQty) => {
    const v = qtyOverride[key]
    if (v === undefined || v === '') return requiredQty
    const n = Number(v)
    return isNaN(n) ? requiredQty : n
  }

  const setQty = (key, value) => setQtyOverride(prev => ({ ...prev, [key]: value }))

  const pickedCount   = Object.values(lineStatus).filter(s => s === 'picked').length
  const skippedCount  = Object.values(lineStatus).filter(s => s === 'skipped').length
  const doneCount     = Object.values(lineStatus).filter(s => s === 'done').length
  const totalLines    = jobSummary.length
  const progressCount = pickedCount + skippedCount + doneCount

  /**
   * The { piece_id, offcuts } list for one fabric line.
   *
   * A piece is consumed whole and whatever survives goes back as new pieces —
   * the same shape a bar offcut uses, and for the same reason: what comes off
   * a roll is a different physical thing from what went on it, and giving it
   * its own row means it gets its own label to write on the fabric.
   *
   * Bands cut from one roll are collapsed into a single entry, so a roll that
   * supplied three bands is only marked used once.
   */
  const buildFabricDeductions = (row, key) => {
    const bands      = nestGroups(row.fabricCuts || [])
    const selections = fabricSelections[key] || {}
    const byPiece    = new Map()

    bands.forEach((band, bandIdx) => {
      const pieceId = selections[bandIdx]
      if (!pieceId) return
      if (!byPiece.has(pieceId)) byPiece.set(pieceId, { piece_id: pieceId, offcuts: [] })
      const side = offcutData[key]?.[`side:${bandIdx}`]
      if (side?.add && side.length_mm > 0 && side.roll_width_mm > 0) {
        byPiece.get(pieceId).offcuts.push({
          label:         side.label?.trim() || `${Math.round(side.roll_width_mm)}×${Math.round(side.length_mm)}mm`,
          length_mm:     Math.round(side.length_mm),
          roll_width_mm: Math.round(side.roll_width_mm),
        })
      }
    })

    byPiece.forEach((entry, pieceId) => {
      const tail = offcutData[key]?.[`tail:${pieceId}`]
      if (tail?.add && tail.length_mm > 0 && tail.roll_width_mm > 0) {
        entry.offcuts.push({
          label:         tail.label?.trim() || `${Math.round(tail.roll_width_mm)}×${Math.round(tail.length_mm)}mm`,
          length_mm:     Math.round(tail.length_mm),
          roll_width_mm: Math.round(tail.roll_width_mm),
        })
      }
    })

    return [...byPiece.values()]
  }

  const handleDeduct = () => {
    const deductions = jobSummary
      .filter(row => lineStatus[stockKey(row.component.id, row.colour_variant)] === 'picked')
      .map(row => {
        const key    = stockKey(row.component.id, row.colour_variant)
        const isBar  = row.component.order_type === 'bar'
        if (isBar) {
          const barLengthMm = Number(row.component.bar_length_mm) || 6000
          const cuts  = row.cuts?.length ? row.cuts : [{ mm: Math.round(row.total_qty * 1000), label: null }]
          const bars  = buildBarDeductions(cuts, barLengthMm, barSelections[key] || {}, offcutData[key] || {})
          return { component: row.component, colour_variant: row.colour_variant, qty: row.total_qty, bars }
        }
        if (row.component.order_type === 'fabric') {
          return {
            component:      row.component,
            colour_variant: row.colour_variant,
            qty:            row.total_qty,
            fabric_pieces:  buildFabricDeductions(row, key),
          }
        }
        // Pack component — may be adjusted up or down by the picker
        return {
          component:      row.component,
          colour_variant: row.colour_variant,
          qty:            effectiveQty(key, row.total_qty),
          bar_id:         null,
          offcut:         null,
        }
      })
    onDeduct(deductions)
  }

  const packRows   = jobSummary.filter(r => !['bar', 'fabric'].includes(r.component.order_type))
  const barRows    = jobSummary.filter(r => r.component.order_type === 'bar')
  const fabricRows = jobSummary.filter(r => r.component.order_type === 'fabric')

  const renderPackRow = (row) => {
    const key    = stockKey(row.component.id, row.colour_variant)
    const status = lineStatus[key] || 'pending'
    const isDone = status === 'done'
    const stock  = stockMap[key]
    const qtyOnHand  = Number(stock?.qty_on_hand) || 0
    const deductQty  = effectiveQty(key, row.total_qty)
    const sufficient = qtyOnHand >= deductQty
    const adjusted   = deductQty !== row.total_qty

    const rowBg = isDone ? '#f0fdf4' : status === 'picked' ? 'var(--success-bg)' : status === 'skipped' ? 'var(--warm-100)' : '#fff'

    return (
      <div key={key} style={{ padding: '14px 20px', borderBottom: '1px solid var(--warm-100)', background: rowBg, transition: 'background 0.15s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => toggleLine(key)} style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            border: `2px solid ${(status === 'picked' || isDone) ? 'var(--success)' : 'var(--warm-200)'}`,
            background: (status === 'picked' || isDone) ? 'var(--success)' : '#fff',
            cursor: isDone ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: isDone ? 0.7 : 1,
          }}>
            {(status === 'picked' || isDone) && <CheckIcon size={14} color="#fff" />}
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, textDecoration: status === 'skipped' ? 'line-through' : 'none', color: status === 'skipped' ? 'var(--warm-300)' : 'var(--ink)' }}>
              {row.component.name}
              {row.colour_variant && <span style={{ fontSize: 12, color: 'var(--warm-300)', fontWeight: 400, marginLeft: 6 }}>· {row.colour_variant.name}</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>
              {isDone ? (
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Already deducted</span>
              ) : (
                <>
                  Required: <strong>{fmtQty(row.total_qty)} {row.component.unit}</strong>
                  {row.widthFormulaLabel && (
                    <span style={{ marginLeft: 8, fontWeight: 700, color: 'var(--ink)' }}>({row.widthFormulaLabel})</span>
                  )}
                  {stock && <span style={{ marginLeft: 8, color: sufficient ? 'var(--success)' : 'var(--danger)' }}>· In stock: {fmtQty(qtyOnHand)}</span>}
                  {!stock && <span style={{ marginLeft: 8, color: 'var(--warm-300)' }}>· Stock not tracked</span>}
                </>
              )}
            </div>
          </div>

          {/* Deduct qty — editable so extra parts can be taken */}
          {!isDone && (
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--warm-300)', display: 'block', marginBottom: 2 }}>
                Deduct
              </label>
              <input
                type="number" step="any" min="0"
                value={qtyOverride[key] ?? fmtQty(row.total_qty)}
                onChange={e => setQty(key, e.target.value)}
                onFocus={e => e.target.select()}
                className="field-input"
                style={{
                  width: 74, padding: '6px 8px', fontSize: 14, textAlign: 'right',
                  fontWeight: 700,
                  borderColor: adjusted ? 'var(--accent)' : undefined,
                  background: adjusted ? 'var(--accent-bg)' : undefined,
                }}
              />
            </div>
          )}

          {!isDone && (
            <button onClick={() => skipLine(key)} style={{
              fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
              border: '1px solid var(--warm-200)',
              background: status === 'skipped' ? 'var(--warm-200)' : 'none',
              color: 'var(--warm-300)', cursor: 'pointer',
            }}>
              {status === 'skipped' ? 'Undo' : 'Skip'}
            </button>
          )}
        </div>
      </div>
    )
  }

  const renderBarRow = (row) => {
    const key    = stockKey(row.component.id, row.colour_variant)
    const status = lineStatus[key] || 'pending'
    const isDone = status === 'done'
    const stock  = stockMap[key]
    const qtyOnHand   = Number(stock?.qty_on_hand) || 0
    const barLengthMm = Number(row.component.bar_length_mm) || 6000

    const cuts   = row.cuts?.length ? row.cuts : [{ mm: Math.round(row.total_qty * 1000), label: null }]
    const packed = packCuts(cuts, barLengthMm)

    const totalMm     = cuts.reduce((s, c) => s + c.mm, 0)
    const totalCuts   = countCutSlots(cuts, barLengthMm)
    const selections  = barSelections[key] || {}
    const allSelected = Object.values(selections).filter(Boolean).length === totalCuts
    // A specific offcut already claimed by another cut in this line can't be
    // picked again — each physical offcut supplies at most one cut.
    const claimedOffcutIds = new Set(Object.values(selections).filter(v => v && v !== '__full_bar__'))

    const rowBg = isDone ? '#f0fdf4' : status === 'picked' ? 'var(--success-bg)' : status === 'skipped' ? 'var(--warm-100)' : '#fff'

    return (
      <div key={key} style={{ borderBottom: '1px solid var(--warm-100)', background: rowBg, transition: 'background 0.15s' }}>
        {/* Row header */}
        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => toggleLine(key)} style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            border: `2px solid ${(status === 'picked' || isDone) ? 'var(--success)' : allSelected ? 'var(--accent)' : 'var(--warm-200)'}`,
            background: (status === 'picked' || isDone) ? 'var(--success)' : '#fff',
            cursor: isDone ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: isDone ? 0.7 : 1,
          }}>
            {(status === 'picked' || isDone) && <CheckIcon size={14} color="#fff" />}
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: status === 'skipped' ? 'var(--warm-300)' : 'var(--ink)', textDecoration: status === 'skipped' ? 'line-through' : 'none' }}>
              {row.component.name}
              {row.colour_variant && <span style={{ fontSize: 12, color: 'var(--warm-300)', fontWeight: 400, marginLeft: 6 }}>· {row.colour_variant.name}</span>}
            </div>
            {isDone ? (
              <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, marginTop: 2 }}>✓ Already deducted</div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>
                {cuts.length} cut{cuts.length !== 1 ? 's' : ''}: {cuts.map(c => `${c.mm.toLocaleString()}mm${c.label ? ` (${c.label})` : ''}`).join(' + ')} = {totalMm.toLocaleString()}mm
                <span style={{ marginLeft: 8, fontWeight: 700, color: 'var(--ink)' }}>→ up to {packed.length} bar{packed.length !== 1 ? 's' : ''} needed</span>
                {stock && <span style={{ marginLeft: 8, color: qtyOnHand >= packed.length ? 'var(--success)' : 'var(--danger)' }}>· {qtyOnHand} in stock</span>}
              </div>
            )}
          </div>

          {!isDone && (
            <button onClick={() => skipLine(key)} style={{
              fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
              border: '1px solid var(--warm-200)',
              background: status === 'skipped' ? 'var(--warm-200)' : 'none',
              color: 'var(--warm-300)', cursor: 'pointer',
            }}>
              {status === 'skipped' ? 'Undo' : 'Skip'}
            </button>
          )}
        </div>

        {/* Per-bin groups, each showing one selector per individual cut —
            cuts within a group can be mixed across offcuts and a shared full
            bar, not forced onto one single source. */}
        {!isDone && status !== 'skipped' && packed.map((bin, binIdx) => {
          const binCutTotal = bin.cuts.reduce((s, c) => s + c.mm, 0)
          // Cuts in this bin currently set to share a full bar, for the
          // bin-level leftover prompt.
          const fullBarCutIdxs = bin.cuts
            .map((_, i) => i)
            .filter(i => selections[`${binIdx}.${i}`] === '__full_bar__')
          const fullBarUsedMm   = fullBarCutIdxs.reduce((s, i) => s + bin.cuts[i].mm, 0)
          const fullBarRemainMm = barLengthMm - fullBarUsedMm
          const barLeftoverKey  = `bar:${binIdx}`
          const barOd           = offcutData[key]?.[barLeftoverKey]

          return (
            <div key={binIdx} style={{
              margin: '0 20px 10px 60px',
              border: '1px solid var(--warm-200)',
              borderRadius: 8,
              background: '#fff',
              overflow: 'hidden',
            }}>
              {/* Bin header */}
              <div style={{ padding: '8px 12px', background: 'var(--warm-100)', borderBottom: '1px solid var(--warm-200)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                  {bin.cuts.length > 1 ? `Bar group ${binIdx + 1}` : `Cut ${binIdx + 1}`}
                  <span style={{ fontWeight: 400, color: 'var(--warm-300)', marginLeft: 8 }}>
                    {bin.cuts.length > 1 && `${bin.cuts.map(c => `${c.mm.toLocaleString()}mm${c.label ? ` (${c.label})` : ''}`).join(' + ')} = ${binCutTotal.toLocaleString()}mm total`}
                  </span>
                </div>
                {bin.oversized && (
                  <div style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 500, marginTop: 4 }}>
                    ⚠️ Cut exceeds bar length ({barLengthMm.toLocaleString()}mm) — check product recipe
                  </div>
                )}
              </div>

              {!bin.oversized && (
                <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {bin.cuts.map(({ mm: cutLength, label: cutLabel }, cutInBinIdx) => {
                    const selKey    = `${binIdx}.${cutInBinIdx}`
                    const selectedId = selections[selKey]
                    const od         = offcutData[key]?.[`cut:${selKey}`]

                    const suitableOffcuts = findSuitableBars(stockBars, row.component.id, row.colour_variant, cutLength)
                      .filter(bar => !claimedOffcutIds.has(bar.id) || bar.id === selectedId)
                    const fullBarOk  = qtyOnHand > 0 && barLengthMm >= cutLength
                    const hasOptions = suitableOffcuts.length > 0 || fullBarOk

                    // Leftover from a specific offcut selected for this cut
                    let offcutRemainMm = 0
                    if (selectedId && selectedId !== '__full_bar__') {
                      const bar = stockBars.find(b => b.id === selectedId)
                      if (bar) offcutRemainMm = bar.length_mm - cutLength
                    }

                    return (
                      <div key={selKey} style={{
                        padding: '8px 10px', borderRadius: 6,
                        border: `1px solid ${selectedId ? 'var(--accent)' : 'var(--warm-100)'}`,
                        background: selectedId ? 'var(--accent-bg)' : 'var(--warm-100)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                            {cutLength.toLocaleString()}mm cut
                            {cutLabel && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '1px 6px',
                                borderRadius: 4, background: 'var(--blue-bg)', color: 'var(--blue)',
                              }}>{cutLabel}</span>
                            )}
                          </span>
                          {selectedId && <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>✓ Selected</span>}
                        </div>

                        {!hasOptions ? (
                          <div style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 500 }}>
                            ⚠️ No stock long enough for this cut ({cutLength.toLocaleString()}mm needed)
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {fullBarOk && (
                              <button type="button" onClick={() => selectSource(key, selKey, '__full_bar__', totalCuts)} style={{
                                padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                border: `1.5px solid ${selectedId === '__full_bar__' ? 'var(--accent)' : 'var(--warm-200)'}`,
                                background: selectedId === '__full_bar__' ? '#fff' : 'var(--warm-100)',
                                color: selectedId === '__full_bar__' ? 'var(--accent-dark)' : 'var(--ink)',
                              }}>
                                Full bar ({barLengthMm.toLocaleString()}mm)
                              </button>
                            )}
                            {suitableOffcuts.slice(0, 4).map(bar => (
                              <button key={bar.id} type="button" onClick={() => selectSource(key, selKey, bar.id, totalCuts)} style={{
                                padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                border: `1.5px solid ${selectedId === bar.id ? 'var(--accent)' : 'var(--warm-200)'}`,
                                background: selectedId === bar.id ? '#fff' : 'var(--warm-100)',
                                color: selectedId === bar.id ? 'var(--accent-dark)' : 'var(--ink)',
                              }}>
                                {bar.label} ({bar.length_mm.toLocaleString()}mm)
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Leftover from this specific offcut */}
                        {selectedId && selectedId !== '__full_bar__' && offcutRemainMm > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, color: 'var(--warm-300)' }}>
                                Leftover: <strong style={{ color: 'var(--ink)' }}>{Math.round(offcutRemainMm).toLocaleString()}mm</strong>
                              </span>
                              <button type="button" onClick={() => toggleOffcut(key, `cut:${selKey}`, offcutRemainMm)} style={{
                                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                                border: `1px solid ${od?.add ? 'var(--accent)' : 'var(--warm-200)'}`,
                                background: od?.add ? 'var(--accent)' : 'none',
                                color: od?.add ? '#fff' : 'var(--warm-300)',
                              }}>
                                {od?.add ? '✓ Adding offcut' : '+ Save as offcut'}
                              </button>
                            </div>
                            {od?.add && (
                              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                <input className="field-input" style={{ flex: 2, fontSize: 13 }} placeholder="Label"
                                  value={od?.label || ''} onChange={e => setOffcutLabel(key, `cut:${selKey}`, e.target.value)} />
                                <div style={{ position: 'relative', flex: 1 }}>
                                  <input className="field-input" type="number" min="1" step="1"
                                    style={{ fontSize: 13, paddingRight: 36 }}
                                    value={od?.length_mm ?? Math.round(offcutRemainMm)}
                                    onChange={e => setOffcutLength(key, `cut:${selKey}`, Number(e.target.value))} />
                                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--warm-300)', pointerEvents: 'none' }}>mm</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Leftover shared across cuts that both chose "full bar" */}
                  {fullBarCutIdxs.length > 0 && fullBarRemainMm > 0 && (
                    <div style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--warm-100)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--warm-300)' }}>
                          Shared bar leftover: <strong style={{ color: 'var(--ink)' }}>{Math.round(fullBarRemainMm).toLocaleString()}mm</strong>
                        </span>
                        <button type="button" onClick={() => toggleOffcut(key, barLeftoverKey, fullBarRemainMm)} style={{
                          fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                          border: `1px solid ${barOd?.add ? 'var(--accent)' : 'var(--warm-200)'}`,
                          background: barOd?.add ? 'var(--accent)' : 'none',
                          color: barOd?.add ? '#fff' : 'var(--warm-300)',
                        }}>
                          {barOd?.add ? '✓ Adding offcut' : '+ Save as offcut'}
                        </button>
                      </div>
                      {barOd?.add && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <input className="field-input" style={{ flex: 2, fontSize: 13 }} placeholder="Label"
                            value={barOd?.label || ''} onChange={e => setOffcutLabel(key, barLeftoverKey, e.target.value)} />
                          <div style={{ position: 'relative', flex: 1 }}>
                            <input className="field-input" type="number" min="1" step="1"
                              style={{ fontSize: 13, paddingRight: 36 }}
                              value={barOd?.length_mm ?? Math.round(fullBarRemainMm)}
                              onChange={e => setOffcutLength(key, barLeftoverKey, Number(e.target.value))} />
                            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--warm-300)', pointerEvents: 'none' }}>mm</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  /**
   * A fabric line: the bands this job's blinds nest into, and which roll each
   * band comes off.
   *
   * The unit here is the BAND, not the blind — the blinds sharing a band are
   * cut from one length pulled off one roll, so they can't be sourced apart
   * from each other. That's the whole difference from a bar line, where every
   * cut is independent.
   */
  const renderFabricRow = (row) => {
    const key    = stockKey(row.component.id, row.colour_variant)
    const status = lineStatus[key] || 'pending'
    const isDone = status === 'done'

    const bands      = nestGroups(row.fabricCuts || [])
    const selections = fabricSelections[key] || {}
    const totalBands = bands.length
    const allPicked  = totalBands > 0 && Object.values(selections).filter(Boolean).length === totalBands
    const totalLengthMm = bands.reduce((s, b) => s + b.lengthMm, 0)

    // How much each piece is already committed to by other bands, so a roll
    // can't be picked for more length than it holds.
    const committedTo = (pieceId, exceptBandIdx) => bands.reduce((s, b, i) =>
      s + (i !== exceptBandIdx && selections[i] === pieceId ? b.lengthMm : 0), 0)

    const rowBg = isDone ? '#f0fdf4' : status === 'picked' ? 'var(--success-bg)' : status === 'skipped' ? 'var(--warm-100)' : '#fff'

    return (
      <div key={key} style={{ borderBottom: '1px solid var(--warm-100)', background: rowBg, transition: 'background 0.15s' }}>
        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => toggleLine(key)} style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            border: `2px solid ${(status === 'picked' || isDone) ? 'var(--success)' : allPicked ? 'var(--accent)' : 'var(--warm-200)'}`,
            background: (status === 'picked' || isDone) ? 'var(--success)' : '#fff',
            cursor: isDone ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: isDone ? 0.7 : 1,
          }}>
            {(status === 'picked' || isDone) && <CheckIcon size={14} color="#fff" />}
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: status === 'skipped' ? 'var(--warm-300)' : 'var(--ink)', textDecoration: status === 'skipped' ? 'line-through' : 'none' }}>
              {row.component.fabric_code ? `${row.component.fabric_code} · ` : ''}{row.component.name}
              {row.colour_variant && <span style={{ fontSize: 12, color: 'var(--warm-300)', fontWeight: 400, marginLeft: 6 }}>· {row.colour_variant.name}</span>}
            </div>
            {isDone ? (
              <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, marginTop: 2 }}>✓ Already deducted</div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>
                {row.fabricCuts?.length || 0} blind{(row.fabricCuts?.length || 0) !== 1 ? 's' : ''} nested into{' '}
                <strong style={{ color: 'var(--ink)' }}>{totalBands} band{totalBands !== 1 ? 's' : ''}</strong>
                {' · '}{totalLengthMm.toLocaleString()}mm off the roll
                <span style={{ marginLeft: 8 }}>· costed {fmtQty(row.total_qty)}m</span>
              </div>
            )}
          </div>

          {!isDone && (
            <button onClick={() => skipLine(key)} style={{
              fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
              border: '1px solid var(--warm-200)',
              background: status === 'skipped' ? 'var(--warm-200)' : 'none',
              color: 'var(--warm-300)', cursor: 'pointer',
            }}>
              {status === 'skipped' ? 'Undo' : 'Skip'}
            </button>
          )}
        </div>

        {!isDone && status !== 'skipped' && bands.map((band, bandIdx) => {
          const selectedId = selections[bandIdx]
          // Every blind in a band is cut side by side out of ONE length, so
          // the piece has to take all of them across — not just the widest.
          const needWidthMm = band.usedWidthMm

          // Wide enough for the whole band, and long enough for it on top of
          // whatever the other bands already took off the same piece.
          const sources = piecesFitting(
            stockBars, row.component.id, row.colour_variant?.suffix || null,
            needWidthMm, band.lengthMm, 0,
          ).filter(p => (Number(p.length_mm) || 0) >= band.lengthMm + committedTo(p.id, bandIdx))

          const sideKey  = `side:${bandIdx}`
          const sideOd   = offcutData[key]?.[sideKey]
          const selPiece = selectedId && selectedId !== '__new_roll__'
            ? stockBars.find(b => b.id === selectedId) : null

          // The strip really left across the roll. The band's own figure is
          // against the product's NOMINAL roll width; once a specific piece is
          // picked, that piece's actual width is what's left over — and it can
          // be narrower than nominal if the source was itself an offcut.
          const spareWidthMm = selPiece
            ? Math.max(0, Number(selPiece.roll_width_mm) - band.usedWidthMm)
            : band.remainingWidthMm

          // The tail is only offered once per piece — on the last band using it.
          const lastBandForPiece = selectedId &&
            bands.map((_, i) => i).filter(i => selections[i] === selectedId).slice(-1)[0] === bandIdx
          const tailKey    = `tail:${selectedId}`
          const tailOd     = offcutData[key]?.[tailKey]
          const tailLength = selPiece
            ? Number(selPiece.length_mm) - bands.reduce((s, b, i) => s + (selections[i] === selectedId ? b.lengthMm : 0), 0)
            : 0

          return (
            <div key={bandIdx} style={{
              margin: '0 20px 10px 60px',
              border: '1px solid var(--warm-200)', borderRadius: 8,
              background: '#fff', overflow: 'hidden',
            }}>
              <div style={{ padding: '8px 12px', background: 'var(--warm-100)', borderBottom: '1px solid var(--warm-200)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                  Band {bandIdx + 1}
                  <span style={{ fontWeight: 400, color: 'var(--warm-300)', marginLeft: 8 }}>
                    pull {band.lengthMm.toLocaleString()}mm off a {band.rollWidthMm.toLocaleString()}mm roll
                  </span>
                </div>
                {band.oversized ? (
                  <div style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 500, marginTop: 4 }}>
                    ⚠️ {band.pieces[0]?.label}: {band.pieces[0]?.cutWidthMm.toLocaleString()}mm cut is wider than the
                    {' '}{band.rollWidthMm.toLocaleString()}mm roll — check the product's width deduction and roll width
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 4 }}>
                    {band.pieces.map(p => `${p.label} ${p.cutWidthMm.toLocaleString()}×${p.lengthMm.toLocaleString()}`).join('   ·   ')}
                    {band.remainingWidthMm > 0 && (
                      <span style={{ marginLeft: 8 }}>· {Math.round(band.remainingWidthMm).toLocaleString()}mm spare across</span>
                    )}
                  </div>
                )}
              </div>

              {!band.oversized && (
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <button type="button" onClick={() => selectFabricSource(key, bandIdx, '__new_roll__', totalBands)} style={{
                      padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `1.5px solid ${selectedId === '__new_roll__' ? 'var(--accent)' : 'var(--warm-200)'}`,
                      background: selectedId === '__new_roll__' ? '#fff' : 'var(--warm-100)',
                      color: selectedId === '__new_roll__' ? 'var(--accent-dark)' : 'var(--ink)',
                    }}>
                      New roll
                    </button>
                    {sources.slice(0, 5).map(p => (
                      <button key={p.id} type="button" onClick={() => selectFabricSource(key, bandIdx, p.id, totalBands)} style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: `1.5px solid ${selectedId === p.id ? 'var(--accent)' : 'var(--warm-200)'}`,
                        background: selectedId === p.id ? '#fff' : 'var(--warm-100)',
                        color: selectedId === p.id ? 'var(--accent-dark)' : 'var(--ink)',
                      }}>
                        {p.label} ({Number(p.roll_width_mm).toLocaleString()}×{Number(p.length_mm).toLocaleString()}mm)
                      </button>
                    ))}
                  </div>
                  {sources.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 500, marginTop: 8 }}>
                      ⚠️ Nothing in stock is both {Math.round(needWidthMm).toLocaleString()}mm wide and
                      {' '}{band.lengthMm.toLocaleString()}mm long — this band needs a new roll
                    </div>
                  )}

                  {/* The strip left across the roll — the fabric this model
                      exists to stop throwing away. */}
                  {selectedId && spareWidthMm > 0 && (
                    <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--warm-100)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: 'var(--warm-300)' }}>
                          Spare strip: <strong style={{ color: 'var(--ink)' }}>
                            {Math.round(spareWidthMm).toLocaleString()} × {band.lengthMm.toLocaleString()}mm
                          </strong>
                        </span>
                        <button type="button"
                          onClick={() => toggleOffcut(key, sideKey, band.lengthMm, spareWidthMm)}
                          style={{
                            fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                            border: `1px solid ${sideOd?.add ? 'var(--accent)' : 'var(--warm-200)'}`,
                            background: sideOd?.add ? 'var(--accent)' : 'none',
                            color: sideOd?.add ? '#fff' : 'var(--warm-300)',
                          }}>
                          {sideOd?.add ? '✓ Keeping strip' : '+ Keep as offcut'}
                        </button>
                      </div>
                      {sideOd?.add && (
                        <OffcutFields
                          value={sideOd}
                          defaultWidth={Math.round(spareWidthMm)}
                          defaultLength={Math.round(band.lengthMm)}
                          onLabel={v => setOffcutLabel(key, sideKey, v)}
                          onWidth={v => setOffcutWidth(key, sideKey, v)}
                          onLength={v => setOffcutLength(key, sideKey, v)}
                        />
                      )}
                    </div>
                  )}

                  {/* What's left on the roll once every band has come off it. */}
                  {selPiece && lastBandForPiece && tailLength > 0 && (
                    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 6, background: 'var(--warm-100)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: 'var(--warm-300)' }}>
                          Left on {selPiece.label}: <strong style={{ color: 'var(--ink)' }}>
                            {Number(selPiece.roll_width_mm).toLocaleString()} × {Math.round(tailLength).toLocaleString()}mm
                          </strong>
                        </span>
                        <button type="button"
                          onClick={() => toggleOffcut(key, tailKey, tailLength, Number(selPiece.roll_width_mm))}
                          style={{
                            fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                            border: `1px solid ${tailOd?.add ? 'var(--accent)' : 'var(--warm-200)'}`,
                            background: tailOd?.add ? 'var(--accent)' : 'none',
                            color: tailOd?.add ? '#fff' : 'var(--warm-300)',
                          }}>
                          {tailOd?.add ? '✓ Keeping remainder' : '+ Keep remainder'}
                        </button>
                      </div>
                      {tailOd?.add && (
                        <OffcutFields
                          value={tailOd}
                          defaultWidth={Math.round(Number(selPiece.roll_width_mm))}
                          defaultLength={Math.round(tailLength)}
                          onLabel={v => setOffcutLabel(key, tailKey, v)}
                          onWidth={v => setOffcutWidth(key, tailKey, v)}
                          onLength={v => setOffcutLength(key, tailKey, v)}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const SectionHeader = ({ label, count }) => (
    <div style={{ padding: '8px 20px', background: 'var(--warm-100)', borderBottom: '1px solid var(--warm-200)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--warm-300)' }}>
      {label} ({count})
    </div>
  )

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <div>
            <div className="modal-title">Deduct Stock</div>
            <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>
              {job?.customer_name || 'Job'} · tick each component as picked
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div style={{ height: 3, background: 'var(--warm-200)' }}>
          <div style={{ height: '100%', width: `${totalLines > 0 ? (progressCount / totalLines) * 100 : 0}%`, background: 'var(--accent)', transition: 'width 0.2s' }} />
        </div>

        <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          {packRows.length > 0 && (
            <>
              <SectionHeader label="Components" count={packRows.length} />
              {packRows.map(renderPackRow)}
            </>
          )}
          {barRows.length > 0 && (
            <>
              <SectionHeader label="Tracks & Tubes" count={barRows.length} />
              {barRows.map(renderBarRow)}
            </>
          )}
          {fabricRows.length > 0 && (
            <>
              <SectionHeader label="Fabric" count={fabricRows.length} />
              {fabricRows.map(renderFabricRow)}
            </>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--warm-100)', background: 'var(--warm-100)' }}>
          <div style={{ fontSize: 12, color: 'var(--warm-300)', marginBottom: 10 }}>
            {doneCount > 0 && <span style={{ color: 'var(--success)', marginRight: 8 }}>✓ {doneCount} done</span>}
            {pickedCount} picked · {skippedCount} skipped · {totalLines - progressCount} remaining
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Close</button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleDeduct} disabled={saving || pickedCount === 0}>
              {saving ? 'Deducting...' : `Deduct ${pickedCount} Component${pickedCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
