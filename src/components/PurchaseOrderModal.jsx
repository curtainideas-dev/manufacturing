import { useState, useEffect } from 'react'
import { XIcon } from './Icons'

export default function PurchaseOrderModal({ open, suppliers, onClose, onCreate, creating }) {
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes]           = useState('')

  useEffect(() => {
    if (open) { setSupplierId(''); setNotes('') }
  }, [open])

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div className="modal-title">New Purchase Order</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="field-label">Supplier</label>
            <select className="field-input" value={supplierId} autoFocus
              onChange={e => setSupplierId(e.target.value)}>
              <option value="">— Select supplier —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label className="field-label">Notes (optional)</label>
            <textarea className="field-input" rows={2} placeholder="Internal notes..."
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }}
            disabled={creating || !supplierId}
            onClick={() => onCreate({ supplier_id: supplierId, notes: notes.trim() || null })}>
            {creating ? 'Creating...' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  )
}
