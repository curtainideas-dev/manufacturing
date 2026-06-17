import { useState, useEffect } from 'react'
import { XIcon } from './Icons'

export default function StockEditModal({ open, component, colourVariant, stock, onClose, onSave, saving }) {
  const [qtyOnHand, setQtyOnHand]   = useState(0)
  const [qtyMinimum, setQtyMinimum] = useState(0)

  useEffect(() => {
    if (open) {
      setQtyOnHand(stock?.qty_on_hand ?? 0)
      setQtyMinimum(stock?.qty_minimum ?? 0)
    }
  }, [open, stock])

  if (!component) return null

  const colourName = colourVariant?.name || null

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div className="modal-title">
            {component.name}
            {colourName && <span style={{ fontSize: 14, color: 'var(--warm-300)', fontWeight: 400, marginLeft: 8 }}>{colourName}</span>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>
        <div className="modal-body">

          <div style={{
            background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
            padding: '10px 14px', marginBottom: 20,
            fontSize: 12, color: 'var(--warm-300)',
          }}>
            {component.supplier && <span>{component.supplier} · </span>}
            {component.supplier_pn && <span>{component.supplier_pn}{colourVariant?.suffix ? `-${colourVariant.suffix}` : ''} · </span>}
            {component.unit}
          </div>

          <div className="grid-2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Qty on Hand</label>
              <input className="field-input" type="number" step="1" min="0"
                value={qtyOnHand} onChange={e => setQtyOnHand(e.target.value)}
                style={{ fontSize: 22, fontWeight: 700, textAlign: 'right' }} />
              <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>
                Current stock level
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Minimum Stock</label>
              <input className="field-input" type="number" step="1" min="0"
                value={qtyMinimum} onChange={e => setQtyMinimum(e.target.value)}
                style={{ fontSize: 22, fontWeight: 700, textAlign: 'right' }} />
              <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>
                Alert + PO below this
              </div>
            </div>
          </div>

        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }}
            onClick={() => onSave({ qty_on_hand: Number(qtyOnHand), qty_minimum: Number(qtyMinimum) })}
            disabled={saving}>
            {saving ? 'Saving...' : 'Save Stock Level'}
          </button>
        </div>
      </div>
    </div>
  )
}