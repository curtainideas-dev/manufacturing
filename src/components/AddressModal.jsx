import { useState, useEffect } from 'react'
import { XIcon, TrashIcon } from './Icons'

/**
 * One of the places goods can be sent.
 *
 * The delivery address used to be a single field on the company record, which
 * meant editing the business to change where one order landed — and then
 * remembering to put it back. These are rows instead, so an order picks one
 * rather than rewriting it.
 *
 * `note` belongs to the PLACE, not to the business: "rear roller door,
 * 7am-3pm" is true of the warehouse and false of the workroom, which is
 * exactly why it could not live where it used to.
 */
const DEFAULT = { label: '', address: '', note: '', is_default: false }

export default function AddressModal({ open, address, onClose, onSave, onDelete, saving }) {
  const [form, setForm] = useState(DEFAULT)

  useEffect(() => {
    if (open) setForm(address ? { ...DEFAULT, ...address } : DEFAULT)
  }, [open, address])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const valid = form.label.trim() && form.address.trim()

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-header">
          <div className="modal-title">{address ? 'Edit Address' : 'Add Address'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="field-label">Name</label>
            <input className="field-input" value={form.label} autoFocus
              onChange={e => set('label', e.target.value)}
              placeholder="e.g. Workshop, Warehouse" />
            <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 5 }}>
              What this place is called when you pick it on an order. Not printed.
            </div>
          </div>

          <div className="field">
            <label className="field-label">Address</label>
            <textarea className="field-input" rows={3} value={form.address}
              onChange={e => set('address', e.target.value)}
              placeholder={'123 Example Street\nSuburb VIC 3000'}
              style={{ resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 5 }}>
              Printed on the order exactly as typed, line breaks kept.
            </div>
          </div>

          <div className="field">
            <label className="field-label">Delivery note</label>
            <input className="field-input" value={form.note || ''}
              onChange={e => set('note', e.target.value)}
              placeholder="e.g. Deliveries 7am-3pm, rear roller door" />
            <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 5 }}>
              Printed under this address. Standing instructions for this place only.
            </div>
          </div>

          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
            padding: '11px 13px', background: 'var(--warm-100)', borderRadius: 'var(--radius-sm)',
          }}>
            <input type="checkbox" checked={!!form.is_default}
              onChange={e => set('is_default', e.target.checked)}
              style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Use this by default</div>
              <div style={{ fontSize: 11.5, color: 'var(--warm-300)', marginTop: 2, lineHeight: 1.45 }}>
                New orders deliver here unless another address is picked. Only one
                address can be the default — setting this one clears the other.
              </div>
            </div>
          </label>

          {address && (
            <>
              <div className="divider" />
              <button className="btn btn-danger btn-block" onClick={() => onDelete(address.id)}>
                <TrashIcon size={15} /> Delete Address
              </button>
              <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 6, lineHeight: 1.45 }}>
                Orders already sent to this address go back to the default one.
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => onSave(form)}
            disabled={saving || !valid}>
            {saving ? 'Saving...' : address ? 'Save Changes' : 'Add Address'}
          </button>
        </div>
      </div>
    </div>
  )
}
