import { useState, useRef } from 'react'
import { XIcon } from './Icons'

/**
 * New job: the same four things the Submit a PO page asks for — the customer,
 * the job number, tracks or blinds, and the customer's PO. A job is always one
 * type (tracks and blinds come in on separate POs), so it's settled here and
 * the window table only offers products of that type.
 */
const EMPTY = { customer_name: '', job_number: '', product_type: '', file: null }

export default function NewJobModal({ open, onClose, onCreate, creating }) {
  const [form, setForm]   = useState(EMPTY)
  const [tried, setTried] = useState(false)
  const fileRef = useRef(null)

  if (!open) return null
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const missing = [
    !form.customer_name.trim() && 'customer',
    !form.product_type && 'tracks or blinds',
  ].filter(Boolean)

  const close = () => { setForm(EMPTY); setTried(false); onClose() }
  const submit = async () => {
    setTried(true)
    if (missing.length) return
    const ok = await onCreate(form)
    if (ok) { setForm(EMPTY); setTried(false); onClose() }
  }

  return (
    <div className="modal-overlay open" onClick={close}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">New job</div>
          <button onClick={close} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-300)', padding: 4 }}>
            <XIcon size={22} />
          </button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="field">
              <label className="field-label">Customer</label>
              <input className="field-input" autoFocus value={form.customer_name}
                onChange={e => set('customer_name', e.target.value)} placeholder="Johnson Residence"
                style={tried && !form.customer_name.trim() ? { outline: '1.5px solid #fca5a5' } : undefined} />
            </div>
            <div className="field">
              <label className="field-label">Job no.</label>
              <input className="field-input" value={form.job_number}
                onChange={e => set('job_number', e.target.value)} placeholder="1002765" />
            </div>
          </div>

          <div className="field">
            <label className="field-label">Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['track', '📏 Tracks'], ['blind', '🪟 Blinds']].map(([v, label]) => (
                <button key={v} type="button" onClick={() => set('product_type', v)}
                  className={`btn ${form.product_type === v ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, ...(tried && !form.product_type ? { outline: '1.5px solid #fca5a5' } : {}) }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">Customer PO (optional)</label>
            <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }}
              onChange={e => { set('file', e.target.files?.[0] || null); e.target.value = '' }} />
            <button type="button" className="btn btn-secondary btn-block" onClick={() => fileRef.current?.click()}>
              📄 {form.file ? form.file.name : 'Attach PDF'}
            </button>
          </div>

          {tried && missing.length > 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--danger)', marginTop: 10 }}>
              Add the {missing.join(' and ')} first.
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={close}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={submit} disabled={creating}>
            {creating ? 'Uploading…' : 'Create job'}
          </button>
        </div>
      </div>
    </div>
  )
}
