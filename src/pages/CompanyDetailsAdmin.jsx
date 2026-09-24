import { useState, useEffect } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../components/Icons'

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
 *
 * Delivery addresses are the exception and are NOT part of that row. There is
 * more than one place goods land — workroom, warehouse, occasionally a site —
 * and a single field meant editing the business before each order and putting
 * it back afterwards, which nobody does. They are rows of their own, and an
 * order picks one.
 */
const FIELDS = [
  { key: 'name',    label: 'Business name', placeholder: 'Curtain Ideas',
    hint: 'Printed as the letterhead and as the "deliver to" name.' },
  { key: 'abn',     label: 'ABN', placeholder: '12 345 678 901' },
  { key: 'phone',   label: 'Phone', placeholder: '03 9xxx xxxx' },
  { key: 'email',   label: 'Email', placeholder: 'orders@curtainideas.com.au' },
  { key: 'website', label: 'Website', placeholder: 'curtainideas.com.au' },
]

export default function CompanyDetailsAdmin({
  company, addresses, onBack, onSave, saving, onNewAddress, onEditAddress,
}) {
  // null means the table isn't there yet, which is not the same as "no
  // addresses" — one is a setup step, the other is a shop that hasn't added
  // any. Saying "none" to the first would be a lie with an obvious next step
  // attached, which is how people delete things that were never missing.
  const available = addresses !== null
  const list      = addresses || []
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

          <button className="btn btn-primary btn-block"
            disabled={saving || !dirty}
            onClick={() => onSave(form).then(() => setDirty(false))}>
            {saving ? 'Saving…' : dirty ? 'Save Details' : 'Saved'}
          </button>

          <div className="divider" />

          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--warm-300)', marginBottom: 8 }}>
            Delivery addresses
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--warm-300)', marginBottom: 12, lineHeight: 1.5 }}>
            The places suppliers deliver to. Each order picks one, so a delivery to
            the warehouse does not mean editing the business and putting it back.
            Orders that pick nothing use the default.
          </div>

          {!available ? (
            <div style={{
              background: 'var(--warning-bg)', borderLeft: '3px solid var(--warning)',
              borderRadius: 'var(--radius-sm)', padding: '11px 13px',
              fontSize: 12.5, color: 'var(--warning)', marginBottom: 16,
            }}>
              The <strong>company_addresses</strong> table doesn&apos;t exist yet — run
              <strong> supabase_po_delivery_pickup.sql</strong> to switch this on. Until
              then every order delivers to the postal address above.
            </div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 12 }}>
                {list.length === 0 ? (
                  <div className="empty-state" style={{ padding: '24px 20px' }}>
                    <div className="empty-icon" style={{ fontSize: 30 }}>📍</div>
                    <div className="empty-desc">
                      No addresses yet — orders deliver to the postal address above.
                    </div>
                  </div>
                ) : list.map(a => (
                  <div key={a.id} className="component-item" onClick={() => onEditAddress(a)}>
                    <div className="component-avatar" style={{ fontSize: 16 }}>📍</div>
                    <div className="component-info">
                      <div className="component-name">
                        {a.label}
                        {a.is_default && (
                          <span className="pill pill-green" style={{ marginLeft: 8 }}>Default</span>
                        )}
                      </div>
                      {/* One line, however many the address is typed on: this is
                          a list to recognise a place in, not the printed copy. */}
                      <div className="component-sub">
                        {String(a.address || '').split('\n').map(s => s.trim()).filter(Boolean).join(', ')}
                        {a.note ? ` · ${a.note}` : ''}
                      </div>
                    </div>
                    <ChevronRightIcon size={16} color="var(--warm-200)" style={{ flexShrink: 0 }} />
                  </div>
                ))}
              </div>

              <button className="btn btn-secondary btn-block" onClick={onNewAddress}>
                <PlusIcon size={16} /> Add Address
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
