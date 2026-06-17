import { useState, useEffect } from 'react'
import { XIcon } from './Icons'

export default function ReceiveBarsModal({ open, component, colourVariant, stock, onClose, onSave, saving }) {
  const [qty, setQty] = useState('')

  useEffect(() => {
    if (open) setQty('')
  }, [open])

  if (!component) return null

  const currentQty  = Number(stock?.qty_on_hand) || 0
  const colourLabel = colourVariant ? ` · ${colourVariant.name}` : ''
  const parsed      = parseInt(qty, 10)
  const valid       = !isNaN(parsed) && parsed > 0

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div className="modal-title">Receive Bars</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>
        <div className="modal-body">

          <div style={{
            background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
            padding: '10px 14px', marginBottom: 20, fontSize: 14, fontWeight: 600,
          }}>
            {component.name}{colourLabel}
            <div style={{ fontSize: 12, color: 'var(--warm-300)', fontWeight: 400, marginTop: 2 }}>
              {component.supplier_pn
                ? `${component.supplier_pn}${colourVariant ? `-${colourVariant.suffix}` : ''}`
                : 'No part no.'}
              {component.bar_length_mm
                ? ` · ${Number(component.bar_length_mm).toLocaleString()}mm bars`
                : ''}
            </div>
          </div>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 20, padding: '12px 16px',
            background: '#fff', border: '1px solid var(--warm-200)', borderRadius: 'var(--radius-sm)',
          }}>
            <div style={{ fontSize: 13, color: 'var(--warm-300)' }}>Currently on hand</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{currentQty} bars</div>
          </div>

          <div className="field">
            <label className="field-label">Quantity to receive</label>
            <input
              className="field-input"
              type="number"
              step="1"
              min="1"
              value={qty}
              onChange={e => setQty(e.target.value)}
              placeholder="0"
              autoFocus
              style={{ fontSize: 36, fontWeight: 700, textAlign: 'right' }}
            />
          </div>

          {valid && (
            <div style={{
              marginTop: 12, padding: '10px 14px',
              background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
              fontSize: 13, color: 'var(--warm-300)',
            }}>
              New total: <strong style={{ color: 'var(--ink)' }}>{currentQty + parsed} bars</strong>
            </div>
          )}

        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            style={{ flex: 2 }}
            onClick={() => onSave(parsed)}
            disabled={saving || !valid}
          >
            {saving ? 'Saving...' : `Receive ${valid ? parsed : ''} bar${parsed !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
