import { useState } from 'react'
import { XIcon } from './Icons'

const DEFAULT = { label: '', product_id: '', width_mm: '', drop_mm: '' }

export default function AddWindowModal({ open, windowNumber, products, onClose, onAdd }) {
  const [form, setForm] = useState(DEFAULT)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleAdd = () => {
    if (!form.product_id || !form.width_mm || !form.drop_mm) return
    onAdd({ ...form, label: form.label || `Window ${windowNumber}` })
    setForm(DEFAULT)
    onClose()
  }

  if (!open) return null

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div className="modal-title">Add Window</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>
        <div className="modal-body">

          <div className="field">
            <label className="field-label">Label (optional)</label>
            <input className="field-input" value={form.label}
              onChange={e => set('label', e.target.value)}
              placeholder={`Window ${windowNumber}`} />
          </div>

          {/* Product picker — this is the key change from the old type dropdown */}
          <div className="field">
            <label className="field-label">Product</label>
            <select className="field-input" value={form.product_id} onChange={e => set('product_id', e.target.value)}>
              <option value="">— Select a product —</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="grid-2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Width (mm)</label>
              <input className="field-input" type="number" value={form.width_mm}
                onChange={e => set('width_mm', e.target.value)}
                placeholder="e.g. 1800" style={{ textAlign: 'right' }} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Drop (mm)</label>
              <input className="field-input" type="number" value={form.drop_mm}
                onChange={e => set('drop_mm', e.target.value)}
                placeholder="e.g. 2100" style={{ textAlign: 'right' }} />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleAdd}
            disabled={!form.product_id || !form.width_mm || !form.drop_mm}>
            Add Window
          </button>
        </div>
      </div>
    </div>
  )
}
