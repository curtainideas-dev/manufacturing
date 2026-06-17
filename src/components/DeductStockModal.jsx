import { useState, useEffect } from 'react'
import { XIcon, CheckIcon } from './Icons'
import { stockKey, findSuitableBars, packCuts } from '../lib/stockEngine'
import { fmtQty } from '../lib/bomEngine'

export default function DeductStockModal({ open, job, jobSummary, jobMovements, stockMap, stockBars, onClose, onDeduct, saving }) {
  const [lineStatus,    setLineStatus]    = useState({})
  const [barSelections, setBarSelections] = useState({}) // key -> [barId, barId, ...] one per bin
  const [offcutData,    setOffcutData]    = useState({}) // key -> [{ add, label }, ...] one per bin

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

  const selectBar = (key, binIdx, barId, totalBins) => {
    setBarSelections(prev => {
      const arr = [...(prev[key] || [])]
      arr[binIdx] = barId
      // Auto-pick the line when every bin has a selection
      if (arr.filter(Boolean).length === totalBins) {
        setLineStatus(ls => ls[key] !== 'done' ? { ...ls, [key]: 'picked' } : ls)
      }
      return { ...prev, [key]: arr }
    })
  }

  const toggleOffcut = (key, binIdx, defaultLengthMm) => {
    setOffcutData(prev => {
      const arr     = [...(prev[key] || [])]
      const current = arr[binIdx]
      arr[binIdx] = {
        ...current,
        add:       !current?.add,
        length_mm: current?.length_mm ?? Math.round(defaultLengthMm),
      }
      return { ...prev, [key]: arr }
    })
  }

  const setOffcutLabel = (key, binIdx, label) => {
    setOffcutData(prev => {
      const arr = [...(prev[key] || [])]
      arr[binIdx] = { ...arr[binIdx], label }
      return { ...prev, [key]: arr }
    })
  }

  const setOffcutLength = (key, binIdx, length_mm) => {
    setOffcutData(prev => {
      const arr = [...(prev[key] || [])]
      arr[binIdx] = { ...arr[binIdx], length_mm }
      return { ...prev, [key]: arr }
    })
  }

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
          const packed = packCuts(cuts, barLengthMm)
          const bars = packed.map((bin, binIdx) => {
            const od  = offcutData[key]?.[binIdx]
            const selectedId = barSelections[key]?.[binIdx]
            // Remaining from selected source
            let remainingMm = bin.remaining
            if (selectedId && selectedId !== '__full_bar__') {
              const bar = stockBars.find(b => b.id === selectedId)
              if (bar) remainingMm = bar.length_mm - bin.cuts.reduce((s, c) => s + c, 0)
            }
            const offcutLengthMm = od?.length_mm ?? remainingMm
            const offcut = od?.add && offcutLengthMm > 0
              ? { label: od.label?.trim() || `${Math.round(offcutLengthMm)}mm`, length_mm: offcutLengthMm }
              : null
            return { bar_id: selectedId || null, offcut }
          })
          return { component: row.component, colour_variant: row.colour_variant, qty: row.total_qty, bars }
        }
        // Pack component
        const od  = offcutData[key]?.[0]
        return {
          component:      row.component,
          colour_variant: row.colour_variant,
          qty:            row.total_qty,
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
    const sufficient = qtyOnHand >= row.total_qty

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
                  {stock && <span style={{ marginLeft: 8, color: sufficient ? 'var(--success)' : 'var(--danger)' }}>· In stock: {fmtQty(qtyOnHand)}</span>}
                  {!stock && <span style={{ marginLeft: 8, color: 'var(--warm-300)' }}>· Stock not tracked</span>}
                </>
              )}
            </div>
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

    const totalMm    = cuts.reduce((s, c) => s + c, 0)
    const allSelected = (barSelections[key] || []).filter(Boolean).length === packed.length

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
                <span style={{ marginLeft: 8, fontWeight: 700, color: 'var(--ink)' }}>→ {packed.length} bar{packed.length !== 1 ? 's' : ''} needed</span>
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

        {/* Per-bin slots */}
        {!isDone && status !== 'skipped' && packed.map((bin, binIdx) => {
          const selectedId     = barSelections[key]?.[binIdx]
          const od             = offcutData[key]?.[binIdx]
          const binCutTotal    = bin.cuts.reduce((s, c) => s + c, 0)

          // Remaining length from the chosen source
          let remainingMm = bin.remaining
          if (selectedId && selectedId !== '__full_bar__') {
            const bar = stockBars.find(b => b.id === selectedId)
            if (bar) remainingMm = bar.length_mm - binCutTotal
          }

          // Offcuts long enough for this bin's largest cut
          const minNeeded  = Math.max(...bin.cuts)
          const suitableOffcuts = findSuitableBars(stockBars, row.component.id, row.colour_variant, minNeeded)
          const fullBarOk       = qtyOnHand > 0 && barLengthMm >= minNeeded
          const hasOptions      = suitableOffcuts.length > 0 || fullBarOk

          return (
            <div key={binIdx} style={{
              margin: '0 20px 10px 60px',
              border: `1px solid ${selectedId ? 'var(--accent)' : 'var(--warm-200)'}`,
              borderRadius: 8,
              background: '#fff',
              overflow: 'hidden',
            }}>
              {/* Bin header */}
              <div style={{ padding: '8px 12px', background: 'var(--warm-100)', borderBottom: '1px solid var(--warm-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                  Bar {binIdx + 1}
                  <span style={{ fontWeight: 400, color: 'var(--warm-300)', marginLeft: 8 }}>
                    {bin.cuts.map(c => `${c.toLocaleString()}mm`).join(' + ')}
                    {bin.cuts.length > 1 && ` = ${binCutTotal.toLocaleString()}mm`}
                  </span>
                </div>
                {selectedId && (
                  <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>✓ Selected</span>
                )}
              </div>

              <div style={{ padding: '10px 12px' }}>
                {bin.oversized ? (
                  <div style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 500 }}>
                    ⚠️ Cut ({binCutTotal.toLocaleString()}mm) exceeds bar length ({barLengthMm.toLocaleString()}mm) — check product recipe
                  </div>
                ) : !hasOptions ? (
                  <div style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 500 }}>
                    ⚠️ No stock long enough for this cut ({minNeeded.toLocaleString()}mm needed)
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {fullBarOk && (
                      <button type="button" onClick={() => selectBar(key, binIdx, '__full_bar__', packed.length)} style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: `1.5px solid ${selectedId === '__full_bar__' ? 'var(--accent)' : 'var(--warm-200)'}`,
                        background: selectedId === '__full_bar__' ? 'var(--accent-bg)' : 'var(--warm-100)',
                        color: selectedId === '__full_bar__' ? 'var(--accent-dark)' : 'var(--ink)',
                      }}>
                        Full bar ({barLengthMm.toLocaleString()}mm) ×{qtyOnHand}
                      </button>
                    )}
                    {suitableOffcuts.slice(0, 4).map(bar => (
                      <button key={bar.id} type="button" onClick={() => selectBar(key, binIdx, bar.id, packed.length)} style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: `1.5px solid ${selectedId === bar.id ? 'var(--accent)' : 'var(--warm-200)'}`,
                        background: selectedId === bar.id ? 'var(--accent-bg)' : 'var(--warm-100)',
                        color: selectedId === bar.id ? 'var(--accent-dark)' : 'var(--ink)',
                      }}>
                        {bar.label} ({bar.length_mm.toLocaleString()}mm)
                      </button>
                    ))}
                  </div>
                )}

                {/* Offcut prompt */}
                {selectedId && !bin.oversized && remainingMm > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--warm-300)' }}>
                        Leftover: <strong style={{ color: 'var(--ink)' }}>{Math.round(remainingMm).toLocaleString()}mm</strong>
                      </span>
                      <button type="button" onClick={() => toggleOffcut(key, binIdx, remainingMm)} style={{
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
                        <input
                          className="field-input"
                          style={{ flex: 2, fontSize: 13 }}
                          placeholder="Label"
                          value={od?.label || ''}
                          onChange={e => setOffcutLabel(key, binIdx, e.target.value)}
                        />
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input
                            className="field-input"
                            type="number"
                            min="1"
                            step="1"
                            style={{ fontSize: 13, paddingRight: 36 }}
                            value={od?.length_mm ?? Math.round(remainingMm)}
                            onChange={e => setOffcutLength(key, binIdx, Number(e.target.value))}
                          />
                          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--warm-300)', pointerEvents: 'none' }}>mm</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
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
