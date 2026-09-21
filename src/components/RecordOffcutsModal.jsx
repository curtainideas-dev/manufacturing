import { useState, useEffect } from 'react'
import { XIcon, CheckIcon } from './Icons'

/**
 * Record Offcuts
 *
 * The second half of a bulk cut. Deducting a job's tracks and tubes takes the
 * bars and offcuts the plan called for; this is where what came BACK off the
 * saw goes on the shelf.
 *
 * They are separate steps because they happen at separate times. The plan can
 * say a 6,000mm bar should leave 1,450mm, but only the bench knows the bar was
 * 40mm short to start with, or that two lengths had to be re-squared, or that
 * the last piece went in the bin. So the plan's figures are a starting point
 * in an editable field, not a fact written to stock behind anyone's back.
 *
 * Everything is pre-ticked, because the expected case is that the leftovers
 * are kept roughly as predicted. Untick what went in the bin; change the
 * length on anything that didn't come out as planned; add a piece the plan
 * never saw. The lengths saved here are what the NEXT job's cutting plan will
 * try to use, so a guess entered here is a cut that won't fit later.
 */
export default function RecordOffcutsModal({ open, job, pending = [], onClose, onSave, saving }) {
  // groupIdx -> { rows: [{ keep, label, length_mm }], extras: [...] }
  const [draft, setDraft] = useState({})

  useEffect(() => {
    if (!open) return
    const next = {}
    pending.forEach((g, gi) => {
      next[gi] = (g.offcuts || []).map(o => ({
        keep:      true,
        label:     o.label || '',
        length_mm: Math.round(Number(o.length_mm) || 0),
        from:      o.from_label || null,
      }))
    })
    setDraft(next)
  }, [open, pending])

  if (!open) return null

  const setRow = (gi, ri, patch) => setDraft(prev => ({
    ...prev,
    [gi]: (prev[gi] || []).map((r, i) => i === ri ? { ...r, ...patch } : r),
  }))

  const addRow = (gi) => setDraft(prev => ({
    ...prev,
    [gi]: [...(prev[gi] || []), { keep: true, label: '', length_mm: 0, from: null, added: true }],
  }))

  const removeRow = (gi, ri) => setDraft(prev => ({
    ...prev,
    [gi]: (prev[gi] || []).filter((_, i) => i !== ri),
  }))

  const keptCount = Object.values(draft)
    .flat()
    .filter(r => r.keep && Number(r.length_mm) > 0).length

  const handleSave = () => {
    // One insert per kept piece, plus the movements to stamp as done. A group
    // with everything unticked still stamps — "nothing was kept" is an answer,
    // and the job should stop asking once it has been given.
    const pieces = []
    pending.forEach((g, gi) => {
      (draft[gi] || []).forEach(r => {
        if (!r.keep || !(Number(r.length_mm) > 0)) return
        pieces.push({
          component_id:   g.component_id,
          colour_variant: g.colour_variant || null,
          label:          (r.label || '').trim() || `${Math.round(r.length_mm)}mm`,
          length_mm:      Math.round(Number(r.length_mm)),
        })
      })
    })
    onSave({ pieces, movementIds: pending.map(g => g.movement_id) })
  }

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <div>
            <div className="modal-title">Record Offcuts</div>
            <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>
              {job?.customer_name || 'Job'} · what came back off the saw
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--warm-300)', lineHeight: 1.5, borderBottom: '1px solid var(--warm-100)' }}>
            Lengths below are what the cutting plan expected. Correct anything that came out
            different, untick what went in the bin, and add any piece the plan didn&apos;t predict.
            These are the lengths the next job will be planned against.
          </div>

          {pending.length === 0 && (
            <div style={{ padding: '28px 20px', textAlign: 'center', fontSize: 13, color: 'var(--warm-300)' }}>
              Nothing waiting to be recorded.
            </div>
          )}

          {pending.map((g, gi) => (
            <div key={g.movement_id} style={{ borderBottom: '1px solid var(--warm-100)' }}>
              <div style={{ padding: '10px 20px', background: 'var(--warm-100)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                  {g.component?.name || 'Component'}
                  {g.colour_variant?.name && (
                    <span style={{ fontSize: 12, color: 'var(--warm-300)', fontWeight: 400, marginLeft: 6 }}>
                      · {g.colour_variant.name}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ padding: '10px 20px' }}>
                {(draft[gi] || []).map((r, ri) => (
                  <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <button onClick={() => setRow(gi, ri, { keep: !r.keep })} style={{
                      width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                      border: `2px solid ${r.keep ? 'var(--success)' : 'var(--warm-200)'}`,
                      background: r.keep ? 'var(--success)' : '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {r.keep && <CheckIcon size={13} color="#fff" />}
                    </button>

                    <input className="field-input" placeholder="Label"
                      style={{ flex: 2, fontSize: 13, opacity: r.keep ? 1 : 0.5 }}
                      value={r.label}
                      onChange={e => setRow(gi, ri, { label: e.target.value })} />

                    <div style={{ position: 'relative', flex: 1, minWidth: 92 }}>
                      <input className="field-input" type="number" min="0" step="1"
                        style={{ fontSize: 13, paddingRight: 34, textAlign: 'right', opacity: r.keep ? 1 : 0.5 }}
                        value={r.length_mm}
                        onFocus={e => e.target.select()}
                        onChange={e => setRow(gi, ri, { length_mm: Number(e.target.value) })} />
                      <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--warm-300)', pointerEvents: 'none' }}>mm</span>
                    </div>

                    {r.added ? (
                      <button onClick={() => removeRow(gi, ri)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--warm-300)', padding: 2, flexShrink: 0,
                      }}><XIcon size={16} /></button>
                    ) : (
                      <span style={{ fontSize: 10, color: 'var(--warm-300)', width: 20, flexShrink: 0 }} />
                    )}
                  </div>
                ))}

                <button onClick={() => addRow(gi)} style={{
                  fontSize: 11.5, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
                  border: '1px dashed var(--warm-200)', background: 'none',
                  color: 'var(--warm-300)', cursor: 'pointer',
                }}>
                  + Add another piece
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--warm-100)', background: 'var(--warm-100)' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave}
              disabled={saving || pending.length === 0}>
              {saving ? 'Saving...' : keptCount > 0
                ? `Put ${keptCount} Offcut${keptCount !== 1 ? 's' : ''} On the Shelf`
                : 'Nothing Kept'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
