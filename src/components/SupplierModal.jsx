import { useState, useEffect } from 'react'
import { XIcon, TrashIcon } from './Icons'

const DEFAULT = {
  name: '',
  contact_name: '',
  email: '',
  phone: '',
  website: '',
  discount: 0,
  notes: '',
}

export default function SupplierModal({ open, supplier, onClose, onSave, onDelete, saving }) {
  const [form, setForm] = useState(DEFAULT)

  useEffect(() => {
    if (open) setForm(supplier ? { ...DEFAULT, ...supplier } : DEFAULT)
  }, [open, supplier])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div className="modal-title">{supplier ? 'Edit Supplier' : 'Add Supplier'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="field-label">Supplier Name</label>
            <input className="field-input" value={form.name} autoFocus
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Acmeda, Motif" />
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div>
              <label className="field-label">Contact Name</label>
              <input className="field-input" value={form.contact_name}
                onChange={e => set('contact_name', e.target.value)}
                placeholder="e.g. John Smith" />
            </div>
            <div>
              <label className="field-label">Phone</label>
              <input className="field-input" type="tel" value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="e.g. 03 9xxx xxxx" />
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div>
              <label className="field-label">Email</label>
              <input className="field-input" type="email" value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="orders@supplier.com" />
            </div>
            <div>
              <label className="field-label">Website</label>
              <input className="field-input" type="url" value={form.website}
                onChange={e => set('website', e.target.value)}
                placeholder="https://..." />
            </div>
          </div>

          {/* Supplier-wide discount — applies as default to all components from this supplier */}
          <div style={{ marginBottom: 16, maxWidth: '50%' }}>
            <label className="field-label">Supplier Discount (%)</label>
            <input className="field-input" type="number" step="0.1" min="0" max="100"
              value={form.discount} onChange={e => set('discount', e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 5 }}>
              Applied as default discount to all components from this supplier. Each component can override this.
            </div>
          </div>

          <div className="field">
            <label className="field-label">Notes</label>
            <textarea className="field-input" rows={2}
              placeholder="Payment terms, lead times, account number..."
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          {supplier && (
            <>
              <div className="divider" />
              <button className="btn btn-danger btn-block" onClick={() => onDelete(supplier.id)}>
                <TrashIcon size={15} /> Delete Supplier
              </button>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => onSave(form)}
            disabled={saving || !form.name.trim()}>
            {saving ? 'Saving...' : supplier ? 'Save Changes' : 'Add Supplier'}
          </button>
        </div>
      </div>
    </div>
  )
}