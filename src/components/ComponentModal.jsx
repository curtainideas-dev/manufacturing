import { useState, useEffect } from 'react'
import { XIcon, TrashIcon } from './Icons'

const UNITS = ['each', 'metres', 'mm', 'm²', 'hours']
const DEFAULT = { name: '', unit: 'each', unit_cost: 0, discount: 0, supplier: '', supplier_pn: '', notes: '' }

export default function ComponentModal({ open, component, onClose, onSave, onDelete, saving }) {
  const [form, setForm] = useState(DEFAULT)

  useEffect(() => {
    if (open) setForm(component ? { ...DEFAULT, ...component } : DEFAULT)
  }, [open, component])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const discountedCost = Number(form.unit_cost) * (1 - (Number(form.discount) || 0) / 100)

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div className="modal-title">{component ? 'Edit Component' : 'Add Component'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>
        <div className="modal-body">

          <div className="field">
            <label className="field-label">Component Name</label>
            <input className="field-input" value={form.name} autoFocus
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Flick Stick, 38 Tube, Chain" />
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div>
              <label className="field-label">Unit</label>
              <select className="field-input" value={form.unit} onChange={e => set('unit', e.target.value)}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Unit Cost ($)</label>
              <input className="field-input" type="number" step="0.01" min="0"
                value={form.unit_cost} onChange={e => set('unit_cost', e.target.value)} />
            </div>
          </div>

          {/* Discount — lives here on the master component, applies across all products */}
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div>
              <label className="field-label">Discount (%)</label>
              <input className="field-input" type="number" step="0.1" min="0" max="100"
                value={form.discount} onChange={e => set('discount', e.target.value)} />
            </div>
            {Number(form.discount) > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 2 }}>
                <label className="field-label">Discounted Cost</label>
                <div style={{
                  padding: '10px 12px', background: 'var(--success-bg)',
                  border: '1px solid #a7f3d0', borderRadius: 'var(--radius-sm)',
                  fontSize: 15, fontWeight: 700, color: 'var(--success)'
                }}>
                  ${discountedCost.toFixed(2)}
                  <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 4 }}>per {form.unit}</span>
                </div>
              </div>
            )}
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div>
              <label className="field-label">Supplier</label>
              <input className="field-input" value={form.supplier}
                onChange={e => set('supplier', e.target.value)} placeholder="e.g. Acmeda" />
            </div>
            <div>
              <label className="field-label">Supplier Part No.</label>
              <input className="field-input" value={form.supplier_pn}
                onChange={e => set('supplier_pn', e.target.value)} placeholder="e.g. ACM-38T" />
            </div>
          </div>

          <div className="field">
            <label className="field-label">Notes</label>
            <textarea className="field-input" rows={2} placeholder="Optional notes..."
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          {component && (
            <>
              <div className="divider" />
              <button className="btn btn-danger btn-block" onClick={() => onDelete(component.id)}>
                <TrashIcon size={15} /> Delete Component
              </button>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => onSave(form)}
            disabled={saving || !form.name.trim()}>
            {saving ? 'Saving...' : component ? 'Save Changes' : 'Add Component'}
          </button>
        </div>
      </div>
    </div>
  )
}
