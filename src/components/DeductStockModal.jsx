import { useState, useEffect } from 'react'
import { XIcon, CheckIcon } from './Icons'
import { stockKey, getStock } from '../lib/stockEngine'
import { planBarCuts, barDeductionsFromPlan, plannedOffcuts, planSummary } from '../lib/cutPlan'
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

  /**
   * The cutting plan for one bar line.
   *
   * Worked out once here and used by both the display and the deduction, so
   * what is confirmed on screen is exactly what leaves the shelf. Bars and
   * tubes are cut in bulk off the rack, so nobody is asked where each cut
   * came from — the plan says, and the leftovers are recorded after sawing.
   *
   * qty_on_hand is a COUNT OF BARS for a bar component, never a length; the
   * offcuts are their own stock_bars rows. Both go in as they are, because
   * that is how the planner asks for them.
   */
  const barPlanFor = (row) => {
    const key  = stockKey(row.component.id, row.colour_variant)
    const cuts = row.cuts?.length
      ? row.cuts
      : [{ mm: Math.round(row.total_qty * 1000), label: null }]
    const suffix = row.colour_variant?.suffix || null
    return planBarCuts({
      cuts,
      barLengthMm: Number(row.component.bar_length_mm) || 0,
      offcuts: (stockBars || []).filter(b =>
        b.component_id === row.component.id &&
        b.status === 'available' &&
        (b.colour_variant?.suffix || null) === suffix),
      fullBarsOnHand: Number(getStock(stockMap, row.component, row.colour_variant)?.qty_on_hand
        ?? stockMap[key]?.qty_on_hand) || 0,
    })
  }

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
          // The confirmed plan is the deduction. Leftovers ride along as a
          // PREDICTION, not as stock — they are entered after the cutting,
          // against what really came off the saw.
          const plan = barPlanFor(row)
          return {
            component:       row.component,
            colour_variant:  row.colour_variant,
            qty:             row.total_qty,
            bars:            barDeductionsFromPlan(plan),
            planned_offcuts: plannedOffcuts(plan),
          }
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

  /**
   * A bar line: the cutting plan for this job's lengths of one track, tube or
   * base bar.
   *
   * Nothing to pick. Tracks and tubes are cut in bulk off the rack, so asking
   * which bar each individual cut came from was asking for a record nobody
   * has at the time — and the answer the app really wanted was the opposite
   * one: given these lengths and what's on the rack, what is the ARRANGEMENT
   * that wastes least? That is what the plan below says, bar by bar and in
   * cutting order, and confirming it is the whole interaction.
   *
   * Leftovers are deliberately absent here. What survives a saw is known at
   * the saw, not before it, so they are recorded afterwards against what
   * really came off — see the Record Offcuts step on the job.
   */
  const renderBarRow = (row) => {
    const key    = stockKey(row.component.id, row.colour_variant)
    const status = lineStatus[key] || 'pending'
    const isDone = status === 'done'
    const plan   = barPlanFor(row)

    const rowBg = isDone ? '#f0fdf4' : status === 'picked' ? 'var(--success-bg)' : status === 'skipped' ? 'var(--warm-100)' : '#fff'

    return (
      <div key={key} style={{ borderBottom: '1px solid var(--warm-100)', background: rowBg, transition: 'background 0.15s' }}>
        {/* Row header */}
        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
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
            <div style={{ fontWeight: 600, fontSize: 14, color: status === 'skipped' ? 'var(--warm-300)' : 'var(--ink)', textDecoration: status === 'skipped' ? 'line-through' : 'none' }}>
              {row.component.name}
              {row.colour_variant && <span style={{ fontSize: 12, color: 'var(--warm-300)', fontWeight: 400, marginLeft: 6 }}>· {row.colour_variant.name}</span>}
            </div>
            {isDone ? (
              <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, marginTop: 2 }}>✓ Already deducted</div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>
                {plan.cuts.length} cut{plan.cuts.length !== 1 ? 's' : ''} · {plan.totalCutMm.toLocaleString()}mm
                <span style={{ marginLeft: 8, fontWeight: 700, color: 'var(--ink)' }}>→ {planSummary(plan)}</span>
                {plan.remnantMm > 0 && (
                  <span style={{ marginLeft: 8 }}>· {Math.round(plan.remnantMm).toLocaleString()}mm over</span>
                )}
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

        {!isDone && status !== 'skipped' && (
          <div style={{ margin: '0 20px 12px 60px' }}>
            {plan.unplannable && (
              <div style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 500, marginBottom: 8 }}>
                ⚠️ No bar length set on this component — set one in the library to get a cutting plan
              </div>
            )}

            {plan.oversized.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 500, marginBottom: 8 }}>
                ⚠️ {plan.oversized.length} cut{plan.oversized.length !== 1 ? 's' : ''} longer than a
                {' '}{plan.barLengthMm.toLocaleString()}mm bar
                {' '}({plan.oversized.map(c => `${c.mm.toLocaleString()}mm${c.label ? ` ${c.label}` : ''}`).join(', ')})
                {' '}— left out of the plan; check the product recipe
              </div>
            )}

            {plan.shortfallBars > 0 && (
              <div style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 500, marginBottom: 8 }}>
                ⚠️ Plan needs {plan.fullBarsUsed} full bar{plan.fullBarsUsed !== 1 ? 's' : ''}, only
                {' '}{plan.fullBarsUsed - plan.shortfallBars} on hand
              </div>
            )}

            {/* One block per bar, in the order to cut them. A bar's own cuts
                are listed longest first — the order the plan packed them in,
                and the order that leaves the remainder in one piece at the
                end of the bar rather than scattered between cuts. */}
            {plan.sources.map((src, i) => {
              const usedPct = src.capacityMm > 0 ? (src.usedMm / src.capacityMm) * 100 : 0
              const barNo   = plan.sources.filter((s, j) => s.kind === 'bar' && j <= i).length
              return (
                <div key={i} style={{
                  border: '1px solid var(--warm-200)', borderRadius: 8,
                  background: '#fff', overflow: 'hidden', marginBottom: 8,
                }}>
                  <div style={{
                    padding: '7px 12px', background: 'var(--warm-100)',
                    borderBottom: '1px solid var(--warm-200)',
                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                      background: src.kind === 'offcut' ? 'var(--accent-bg)' : 'var(--blue-bg)',
                      color: src.kind === 'offcut' ? 'var(--accent-dark)' : 'var(--blue)',
                    }}>{i + 1}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                      {src.kind === 'offcut' ? `Offcut ${src.label}` : `Full bar ${barNo}`}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--warm-300)' }}>
                      {Math.round(src.capacityMm).toLocaleString()}mm
                    </span>
                  </div>

                  <div style={{ padding: '9px 12px' }}>
                    {/* Drawn to scale — the cuts end to end, the remainder shaded. */}
                    <div style={{
                      display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden',
                      border: '1px solid var(--warm-200)', marginBottom: 8,
                    }}>
                      {src.cuts.map((c, ci) => (
                        <div key={ci} title={`${c.mm}mm${c.label ? ` — ${c.label}` : ''}`} style={{
                          width: `${(c.mm / src.capacityMm) * 100}%`,
                          background: ci % 2 ? 'var(--accent)' : 'var(--accent-dark)',
                          borderRight: '1px solid #fff',
                        }} />
                      ))}
                      {src.remainderMm > 0 && <div style={{ flex: 1, background: 'var(--warm-100)' }} />}
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.6 }}>
                      {src.cuts.map((c, ci) => (
                        <span key={ci}>
                          {ci > 0 && <span style={{ color: 'var(--warm-300)' }}> + </span>}
                          <strong>{c.mm.toLocaleString()}mm</strong>
                          {c.label && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, marginLeft: 4, padding: '1px 5px',
                              borderRadius: 4, background: 'var(--blue-bg)', color: 'var(--blue)',
                            }}>{c.label}</span>
                          )}
                        </span>
                      ))}
                    </div>

                    <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 6 }}>
                      {Math.round(src.usedMm).toLocaleString()}mm used · {usedPct.toFixed(0)}%
                      {src.remainderMm > 0
                        ? <> · <strong style={{ color: 'var(--ink)' }}>{Math.round(src.remainderMm).toLocaleString()}mm left over</strong></>
                        : <> · nothing left over</>}
                    </div>
                  </div>
                </div>
              )
            })}

            {plan.remnantMm > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--warm-300)' }}>
                Leftovers are recorded after cutting — use <strong>Record offcuts</strong> on the job once
                the lengths are off the saw.
              </div>
            )}
          </div>
        )}
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
