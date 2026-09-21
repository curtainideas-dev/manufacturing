import { useState, useEffect } from 'react'
import { XIcon } from './Icons'

/**
 * Stocktake — set a bar component's count to what is actually on the rack.
 *
 * Bars could only ever go UP. Receiving added to the count and nothing took
 * away from it, so the one correction a stocktake exists to make — there are
 * fewer than the system thinks — had no way in. Pack components have had a
 * plain "set the number" editor all along; bars were left out because they
 * were given a receive flow instead, and receiving is not counting.
 *
 * So this asks for the COUNT, not a delta. A stocktake produces "there are
 * four", never "take one off", and making someone work out the difference
 * themselves is how a miscount becomes a stock level. The difference is shown
 * back to them as confirmation of what they are about to change, which is the
 * opposite job.
 *
 * Two things are deliberately on the screen and not editable here:
 *
 *   metres    because qty_on_hand for a bar is a COUNT OF BARS and reading it
 *             as a length is the mistake this app has made before. Four 5.4m
 *             bars is 21.6m, and seeing both numbers together is what stops
 *             someone typing 21.6 into a field that means bars.
 *   offcuts   they are counted too, but one by one, because each is its own
 *             piece with its own length. Showing the total here makes it clear
 *             the count being changed is FULL BARS only, not the whole rack.
 */
export default function StocktakeModal({
  open, component, colourVariant, stock, offcuts = [], onClose, onSave, saving,
}) {
  const [counted, setCounted] = useState('')
  const [minimum, setMinimum] = useState(0)

  useEffect(() => {
    if (open) {
      setCounted(String(Number(stock?.qty_on_hand) || 0))
      setMinimum(Number(stock?.qty_minimum) || 0)
    }
  }, [open, stock])

  if (!component) return null

  const barLenMm   = Number(component.bar_length_mm) || 0
  const currentQty = Number(stock?.qty_on_hand) || 0
  const colourLabel = colourVariant ? ` · ${colourVariant.name}` : ''

  const parsed = counted === '' ? NaN : Number(counted)
  const valid  = !isNaN(parsed) && parsed >= 0
  const delta  = valid ? parsed - currentQty : 0

  const offcutMm = offcuts.reduce((t, o) => t + (Number(o.length_mm) || 0), 0)
  const metres   = (n) => ((n * barLenMm) / 1000).toFixed(2)

  const deltaColour = delta < 0 ? 'var(--danger)' : delta > 0 ? 'var(--accent-dark)' : 'var(--warm-300)'

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <div>
            <div className="modal-title">Stocktake</div>
            <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>
              Set the count to what is on the rack
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{
            background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
            padding: '10px 14px', marginBottom: 18, fontSize: 14, fontWeight: 600,
          }}>
            {component.name}{colourLabel}
            <div style={{ fontSize: 12, color: 'var(--warm-300)', fontWeight: 400, marginTop: 2 }}>
              {component.supplier_pn
                ? `${component.supplier_pn}${colourVariant ? `-${colourVariant.suffix}` : ''}`
                : 'No part no.'}
              {barLenMm ? ` · ${barLenMm.toLocaleString()}mm bars` : ' · no bar length set'}
            </div>
          </div>

          {/* What the system currently believes, in both units at once. */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 6, padding: '12px 16px',
            background: '#fff', border: '1px solid var(--warm-200)', borderRadius: 'var(--radius-sm)',
          }}>
            <div style={{ fontSize: 13, color: 'var(--warm-300)' }}>System says</div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{currentQty} bars</div>
              {barLenMm > 0 && (
                <div style={{ fontSize: 11, color: 'var(--warm-300)' }}>{metres(currentQty)} m</div>
              )}
            </div>
          </div>

          <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginBottom: 18, lineHeight: 1.5 }}>
            {offcuts.length > 0
              ? <>Plus {offcuts.length} offcut{offcuts.length !== 1 ? 's' : ''} ({(offcutMm / 1000).toFixed(2)} m),
                  counted separately — add or remove those in the Offcuts list.</>
              : <>No offcuts recorded. This count is full bars only.</>}
          </div>

          <div className="field">
            <label className="field-label">Counted on the rack</label>
            <input
              className="field-input"
              type="number" step="1" min="0"
              value={counted}
              onChange={e => setCounted(e.target.value)}
              onFocus={e => e.target.select()}
              autoFocus
              style={{ fontSize: 36, fontWeight: 700, textAlign: 'right' }}
            />
            <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>
              Full bars only{barLenMm > 0 && valid ? ` — ${metres(parsed)} m` : ''}
            </div>
          </div>

          {/* The change, stated plainly. A stocktake that silently moves stock
              is how a miscount becomes the number everything downstream
              trusts, so what is about to happen is said out loud. */}
          {valid && (
            <div style={{
              marginTop: 12, padding: '10px 14px',
              background: delta === 0 ? 'var(--warm-100)' : delta < 0 ? 'var(--danger-bg, #fef2f2)' : 'var(--success-bg)',
              borderRadius: 'var(--radius-sm)', fontSize: 13,
            }}>
              {delta === 0 ? (
                <span style={{ color: 'var(--warm-300)' }}>No change — the count matches.</span>
              ) : (
                <>
                  <strong style={{ color: deltaColour }}>
                    {delta > 0 ? '+' : ''}{delta} bar{Math.abs(delta) !== 1 ? 's' : ''}
                  </strong>
                  <span style={{ color: 'var(--warm-300)' }}>
                    {' '}· {currentQty} → {parsed}
                    {barLenMm > 0 ? ` · ${delta > 0 ? '+' : ''}${metres(delta)} m` : ''}
                  </span>
                  <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 4 }}>
                    Recorded as a stock adjustment, so the change is traceable later.
                  </div>
                </>
              )}
            </div>
          )}

          <div className="field" style={{ marginTop: 18, marginBottom: 0 }}>
            <label className="field-label">Minimum stock (bars)</label>
            <input className="field-input" type="number" step="1" min="0"
              value={minimum}
              onChange={e => setMinimum(e.target.value)}
              onFocus={e => e.target.select()}
              style={{ fontSize: 18, fontWeight: 700, textAlign: 'right', maxWidth: '50%' }} />
            <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>
              Alerts and reorders below this
              {barLenMm > 0 && Number(minimum) > 0 ? ` — ${metres(Number(minimum))} m` : ''}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }}
            onClick={() => onSave({ counted: parsed, qty_minimum: Number(minimum) || 0 })}
            disabled={saving || !valid}>
            {saving ? 'Saving…' : delta === 0 ? 'Save' : `Set to ${parsed} Bar${parsed !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
