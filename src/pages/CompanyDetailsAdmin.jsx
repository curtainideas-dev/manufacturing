import { useState, useEffect } from 'react'
import { ChevronLeftIcon } from '../components/Icons'

/**
 * Who we are, for documents that leave the building.
 *
 * Everything this app printed until now was for the bench, where the business
 * is assumed and the address is where you are standing. A purchase order goes
 * to someone else, so it has to say who is ordering, where to deliver, and how
 * to get hold of us — and none of that was recorded anywhere.
 *
 * One row, edited in place. Blank fields simply don't print, so a half-filled
 * form produces a shorter letterhead rather than a broken one.
 */
const FIELDS = [
  { key: 'name',    label: 'Business name', placeholder: 'Curtain Ideas',
    hint: 'Printed as the letterhead and as the "deliver to" name.' },
  { key: 'abn',     label: 'ABN', placeholder: '12 345 678 901' },
  { key: 'phone',   label: 'Phone', placeholder: '03 9xxx xxxx' },
  { key: 'email',   label: 'Email', placeholder: 'orders@curtainideas.com.au' },
  { key: 'website', label: 'Website', placeholder: 'curtainideas.com.au' },
]

export default function CompanyDetailsAdmin({ company, onBack, onSave, saving }) {
  const [form, setForm] = useState(company || {})
  const [dirty, setDirty] = useState(false)

  useEffect(() => { setForm(company || {}); setDirty(false) }, [company])

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setDirty(true) }

  return (
    <>
      <div className="header">
        <button className="header-back" onClick={onBack}>
          <ChevronLeftIcon size={18} /> Admin
        </button>
        <div className="header-title" style={{ fontSize: 15 }}>Company Details</div>
      </div>

      <div className="scroll-area">
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 12.5, color: 'var(--warm-300)', marginBottom: 14, lineHeight: 1.5 }}>
            Used on documents that go outside the business. Today that is the purchase order
            PDF — the letterhead at the top and the delivery address a supplier ships to.
            Anything left blank is simply left off.
          </div>

          <div className="card card-body" style={{ marginBottom: 16 }}>
            {FIELDS.map(f => (
              <div className="field" key={f.key} style={{ marginBottom: 12 }}>
                <label className="field-label">{f.label}</label>
                <input className="field-input" value={form[f.key] || ''}
                  placeholder={f.placeholder}
                  onChange={e => set(f.key, e.target.value)} />
                {f.hint && (
                  <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>{f.hint}</div>
                )}
              </div>
            ))}

            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Postal address</label>
              <textarea className="field-input" rows={3}
                value={form.address || ''}
                placeholder={'123 Example Street\nSuburb VIC 3000'}
                onChange={e => set('address', e.target.value)}
                style={{ resize: 'vertical', fontFamily: 'inherit' }} />
              <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>
                Line breaks are kept and printed as typed.
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--warm-300)', marginBottom: 8 }}>
            Deliveries
          </div>

          <div className="card card-body" style={{ marginBottom: 16 }}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="field-label">Delivery address</label>
              <textarea className="field-input" rows={3}
                value={form.delivery_address || ''}
                placeholder="Leave blank to use the postal address"
                onChange={e => set('delivery_address', e.target.value)}
                style={{ resize: 'vertical', fontFamily: 'inherit' }} />
              <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>
                Only needed when suppliers deliver somewhere other than the postal address.
              </div>
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Delivery note</label>
              <input className="field-input" value={form.delivery_note || ''}
                placeholder="e.g. Deliveries 7am–3pm, rear roller door"
                onChange={e => set('delivery_note', e.target.value)} />
              <div style={{ fontSize: 11, color: 'var(--warm-300)', marginTop: 4 }}>
                Printed under the delivery address on every order.
              </div>
            </div>
          </div>

          <button className="btn btn-primary btn-block"
            disabled={saving || !dirty}
            onClick={() => onSave(form).then(() => setDirty(false))}>
            {saving ? 'Saving…' : dirty ? 'Save Details' : 'Saved'}
          </button>
        </div>
      </div>
    </>
  )
}
