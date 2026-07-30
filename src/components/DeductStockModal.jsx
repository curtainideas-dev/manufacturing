import { useState, useEffect } from 'react'
import { XIcon, CheckIcon } from './Icons'
import { stockKey, findSuitableBars, packCuts, buildBarDeductions, countCutSlots } from '../lib/stockEngine'
import { fmtQty } from '../lib/bomEngine'

export default function DeductStockModal({ open, job, jobSummary, jobMovements, stockMap, stockBars, onClose, onDeduct, saving }) {
  const [lineStatus,    setLineStatus]    = useState({})
  // Each cut gets its own source — key -> { "<binIdx>.<cutInBinIdx>": sourceId }
  // sourceId is '__full_bar__' or a specific offcut's id. Cuts in the same bin
  // that both pick '__full_bar__' share one bar; anything else (a specific
  // offcut) is sourced independently, so offcuts and a full bar can mix.
  const [barSelections, setBarSelections] = useState({})
  // Leftover "save as offcut" choices — key -> { "cut:<selKey>"|"bar:<binIdx>": { add, label, length_mm } }
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

  const toggleOffcut = (key, leftoverKey, defaultLengthMm) => {
    setOffcutData(prev => {
      const lineData = { ...(prev[key] || {}) }
      const current  = lineData[leftoverKey]
      lineData[leftoverKey] = {
        ...current,
        add:       !current?.add,
        length_mm: current?.length_mm ?? Math.round(defaultLengthMm),
      }
      return { ...prev, [key]: lineData }
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

  const handleDeduct = () => {
    const deductions = jobSummary
      .filter(row => lineStatus[stockKey(row.component.id, row.colour_variant)] === 'picked')
      .map(row => {
        const key    = stockKey(row.component.id, row.colour_variant)
        const isBar  = row.component.order_type === 'bar'
        if (isBar) {
          const barLengthMm = Number(row.component.bar_length_mm) || 6000
          const cuts  = row.cuts?.length ? row.cuts : [Math.round(row.total_qty * 1000)]
          const bars  = buildBarDeductions(cuts, barLengthMm, barSelections[key] || {}, offcutData[key] || {})
          return { component: row.component, colour_variant: row.colour_variant, qty: row.total_qty, bars }
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

  const packRows = jobSummary.filter(r => r.component.order_type !== 'bar')
  const barRows  = jobSummary.filter(r => r.component.order_type === 'bar')

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

    const cuts   = row.cuts?.length ? row.cuts : [Math.round(row.total_qty * 1000)]
    const packed = packCuts(cuts, barLengthMm)

    const totalMm     = cuts.reduce((s, c) => s + c, 0)
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
                {cuts.length} cut{cuts.length !== 1 ? 's' : ''}: {cuts.map(c => `${c.toLocaleString()}mm`).join(' + ')} = {totalMm.toLocaleString()}mm
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
          const binCutTotal = bin.cuts.reduce((s, c) => s + c, 0)
          // Cuts in this bin currently set to share a full bar, for the
          // bin-level leftover prompt.
          const fullBarCutIdxs = bin.cuts
            .map((_, i) => i)
            .filter(i => selections[`${binIdx}.${i}`] === '__full_bar__')
          const fullBarUsedMm   = fullBarCutIdxs.reduce((s, i) => s + bin.cuts[i], 0)
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
                    {bin.cuts.length > 1 && `${bin.cuts.map(c => `${c.toLocaleString()}mm`).join(' + ')} = ${binCutTotal.toLocaleString()}mm total`}
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
                  {bin.cuts.map((cutLength, cutInBinIdx) => {
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
