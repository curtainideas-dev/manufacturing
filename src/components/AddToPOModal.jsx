import { useState, useEffect } from 'react'
import { XIcon } from './Icons'
import { orderUnitInfo, suggestReorderQty, poDisplayNumber } from '../lib/poEngine'

/**
 * Put one stock line on a purchase order, from the stock page.
 *
 * The quantity is in ORDER UNITS — packs and bars, what the supplier actually
 * sells — because that is what `qty_ordered` means everywhere else in the app
 * and what the PO export prices against. A pack of 5 ordered as "15 each"
 * would go onto the order as 15 packs. So the unit is stated on the field,
 * and the shelf quantity it works out to is shown underneath, since the number
 * someone has in their head standing at the rack is usually the shelf one.
 *
 * It also says, before anything is written, which order the line is going on
 * — and when there is no open draft for that supplier, that one is about to
 * be started. That is the usual case rather than the exception here: most
 * suppliers have no draft open at any given moment.
 */
export default function AddToPOModal({
  open, component, colourVariant, supplier, po, willCreate, stockMap,
  onClose, onAdd, saving,
}) {
  const [qty, setQty] = useState('')

  useEffect(() => {
    if (open && component) setQty(String(suggestReorderQty(component, colourVariant, stockMap)))
  }, [open, component, colourVariant, stockMap])

  if (!component) return null

  const info     = orderUnitInfo(component)
  const isBar    = component.order_type === 'bar'
  const packQty  = isBar ? 1 : (Number(component.pack_qty) || 1)
  const parsed   = qty === '' ? NaN : Number(qty)
  const valid    = !isNaN(parsed) && parsed > 0
  const lineTotal = valid ? parsed * info.price : 0

  const colourLabel = colourVariant ? ` · ${colourVariant.name}` : ''
  const unitWord    = isBar ? 'bar' : 'pack'

  // What the order works out to on the shelf — bars are bars, a pack is
  // whatever is in it.
  const shelfQty = valid
    ? (isBar
        ? `${parsed} bar${parsed !== 1 ? 's' : ''}`
        : `${(parsed * packQty).toLocaleString()} ${component.unit || 'each'}`)
    : null

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <div>
            <div className="modal-title">Add to Order</div>
            <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>
              {supplier?.name || 'No supplier'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{
            background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
            padding: '10px 14px', marginBottom: 16, fontSize: 14, fontWeight: 600,
          }}>
            {component.name}{colourLabel}
            <div style={{ fontSize: 12, color: 'var(--warm-300)', fontWeight: 400, marginTop: 2 }}>
              {component.supplier_pn
                ? `${component.supplier_pn}${colourVariant ? `-${colourVariant.suffix}` : ''}`
                : 'No part no.'}
              {' · '}${info.price.toFixed(2)} per {info.label}
            </div>
          </div>

          {/* Which order, said before it happens. */}
          <div style={{
            padding: '10px 14px', marginBottom: 18, borderRadius: 'var(--radius-sm)',
            background: willCreate ? 'var(--accent-bg)' : '#fff',
            border: `1px solid ${willCreate ? 'var(--accent)' : 'var(--warm-200)'}`,
          }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
              {willCreate
                ? `New draft order for ${supplier?.name || 'this supplier'}`
                : `${poDisplayNumber(po)} · draft`}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 2 }}>
              {willCreate
                ? 'No order is open for them, so one will be started with this line on it.'
                : 'Their open draft — this is added to it.'}
            </div>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">
              Quantity ({unitWord}s{!isBar && packQty > 1 ? ` of ${packQty}` : ''})
            </label>
            <input className="field-input" type="number" step="1" min="1"
              value={qty}
              onChange={e => setQty(e.target.value)}
              onFocus={e => e.target.select()}
              autoFocus
              style={{ fontSize: 36, fontWeight: 700, textAlign: 'right' }} />
            <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>
              Ordered as {unitWord}s, the way {supplier?.name || 'the supplier'} sells it
              {shelfQty ? ` — ${shelfQty} on the shelf` : ''}
            </div>
          </div>

          {valid && (
            <div style={{
              marginTop: 14, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
              background: 'var(--warm-100)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 12.5, color: 'var(--warm-300)' }}>
                {parsed} × ${info.price.toFixed(2)}
              </span>
              <strong style={{ fontSize: 16 }}>${lineTotal.toFixed(2)}</strong>
            </div>
          )}

          {info.price === 0 && (
            <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--warning)', lineHeight: 1.5 }}>
              ⚠️ No {unitWord} price set on this component, so the line will total $0.
              Set one in the component library if the order needs a value.
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }}
            onClick={() => onAdd({ qty: parsed })}
            disabled={saving || !valid}>
            {saving ? 'Adding…' : `Add ${valid ? parsed : ''} ${unitWord}${parsed !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
