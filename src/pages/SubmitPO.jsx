import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast, ToastContainer } from '../hooks/useToast.jsx'

/**
 * The public portal a rep submits a purchase order through.
 *
 * There is no auto-fill. It used to read the PDF and pre-fill the customer
 * name, job number and email, which was right about a third of the time and
 * wrong quietly the rest — jobs reached the ops screen called "Name :" and
 * "Rep Name : Firuz" because the guess was accepted as typed. A field someone
 * filled in is worth more than a field someone was asked to check, so the
 * form asks.
 *
 * Four answers are required, and they are the four nobody downstream can work
 * out for themselves: who it is for, what kind of order it is, and the two
 * dates the factory schedules against. Everything else is optional.
 */

const MAX_MB = 15

const EMPTY = {
  customer_name: '',
  product_type: '',
  job_number: '',
  date_invoice: '',
  delivery_requirement: '',
  submitted_by: '',
  contact_email: '',
}

const ORDER_TYPES = [
  { val: 'track', label: 'Tracks', emoji: '📏' },
  { val: 'blind', label: 'Blinds', emoji: '🪟' },
]

/**
 * Today, as the yyyy-mm-dd an <input type="date"> wants.
 *
 * Built from the LOCAL date parts, never toISOString(), which is UTC — in
 * Australia that reads as yesterday until mid-morning, so a PO submitted at
 * 8am would arrive dated the day before.
 */
const todayISO = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// A fresh blank form. Job date starts on today, since that is what it almost
// always is and it stays editable for the times it isn't.
const newForm = () => ({ ...EMPTY, date_invoice: todayISO() })

// Where the PDF lands in the bucket. Module scope because it is genuinely
// impure — a clock read and a random suffix, so two people submitting the same
// filename at once can't collide — and impure calls don't belong anywhere the
// render path can reach.
const storagePath = (fileName) => {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `portal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`
}

// Required fields, with the name to show when one is missing. Order matches
// the form, so the message reads top to bottom.
const REQUIRED = [
  ['customer_name',        'Customer name'],
  ['product_type',         'Order type'],
  ['date_invoice',         'Job date'],
  ['delivery_requirement', 'Delivery date'],
]

export default function SubmitPO() {
  const [file, setFile]             = useState(null)
  const [form, setForm]             = useState(newForm)
  const [submitting, setSubmitting] = useState(false)
  const [tried, setTried]           = useState(false)
  const [done, setDone]             = useState(false)
  const fileRef = useRef(null)
  const { toasts, showToast } = useToast()

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const missing = REQUIRED.filter(([k]) => !String(form[k] || '').trim()).map(([, label]) => label)
  const missingKeys = new Set(REQUIRED.filter(([k]) => !String(form[k] || '').trim()).map(([k]) => k))
  // Only after a submit attempt, so the form isn't red before it's been used.
  const flag = (k) => tried && missingKeys.has(k)

  const handleFile = (f) => {
    if (!f) return
    if (f.type !== 'application/pdf') { showToast('Please choose a PDF file', 'error'); return }
    if (f.size > MAX_MB * 1024 * 1024) { showToast(`File too large (max ${MAX_MB}MB)`, 'error'); return }
    setFile(f)
  }

  const onInputChange = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    handleFile(f)
  }

  const onDrop = (e) => {
    e.preventDefault()
    handleFile(e.dataTransfer.files?.[0])
  }

  const uploadFile = async () => {
    const path = storagePath(file.name)
    const { error } = await supabase.storage
      .from('customer-orders')
      .upload(path, file, { contentType: 'application/pdf', upsert: false })
    if (error) throw error
    const { data } = supabase.storage.from('customer-orders').getPublicUrl(path)
    return { url: data.publicUrl, name: file.name }
  }

  const handleSubmit = async () => {
    setTried(true)
    if (!file) { showToast('Please attach the PO PDF', 'error'); return }
    if (missing.length) {
      showToast(`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required`, 'error')
      return
    }
    setSubmitting(true)
    try {
      const uploaded = await uploadFile()
      const { error } = await supabase.from('mfg_jobs').insert({
        status:               'received',
        source:               'portal',
        customer_name:        form.customer_name.trim(),
        product_type:         form.product_type,
        job_number:           form.job_number.trim() || null,
        date_invoice:         form.date_invoice || null,
        delivery_requirement: form.delivery_requirement || null,
        submitted_by:         form.submitted_by.trim() || null,
        notes:                form.contact_email.trim() ? `Contact: ${form.contact_email.trim()}` : null,
        po_pdf_url:           uploaded.url,
        po_pdf_name:          uploaded.name,
      })
      if (error) throw error
      setDone(true)
    } catch (err) {
      showToast(err.message || 'Submission failed — please try again', 'error')
    }
    setSubmitting(false)
  }

  const reset = () => {
    // A new date, not the one this form loaded with — the tab may have been
    // open since yesterday.
    setFile(null); setForm(newForm()); setDone(false); setTried(false)
  }

  // ---- Success screen ----
  if (done) {
    return (
      <div className="app" style={{ minHeight: '100dvh' }}>
        <Header />
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Purchase order received</h2>
          <p style={{ color: 'var(--warm-300)', fontSize: 15, maxWidth: 420, marginBottom: 24 }}>
            Thanks{form.submitted_by ? `, ${form.submitted_by}` : ''}. Your PO has been submitted to
            Curtain Ideas and a job has been created. The team will be in touch if anything’s needed.
          </p>
          <button className="btn btn-secondary btn-lg" onClick={reset}>Submit another PO</button>
        </div>
        <ToastContainer toasts={toasts} />
      </div>
    )
  }

  return (
    <div className="app" style={{ minHeight: '100dvh' }}>
      <Header />
      <div style={{ padding: 16, maxWidth: 560, margin: '0 auto', width: '100%' }}>
        <p style={{ color: 'var(--warm-300)', fontSize: 14, margin: '4px 4px 16px' }}>
          Attach your purchase order PDF and fill in the details below. We’ll create the job automatically.
        </p>

        {/* Drop zone */}
        <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={onInputChange} />
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${file ? 'var(--accent)' : (tried ? '#fca5a5' : 'var(--warm-200)')}`,
            borderRadius: 'var(--radius)', background: file ? 'var(--accent-bg)' : '#fff',
            padding: '28px 20px', textAlign: 'center', cursor: 'pointer', marginBottom: 16,
            transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: 34, marginBottom: 6 }}>{file ? '📄' : '📎'}</div>
          {file ? (
            <>
              <div style={{ fontWeight: 600, fontSize: 15, wordBreak: 'break-word' }}>{file.name}</div>
              <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 3 }}>
                Tap to choose a different file
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Tap to attach PO PDF</div>
              <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 3 }}>or drag &amp; drop · PDF, max {MAX_MB}MB</div>
            </>
          )}
        </div>

        {/* Fields */}
        <div className="card card-body">
          <Field label="Customer name" required>
            <input className="field-input" value={form.customer_name}
              onChange={e => setField('customer_name', e.target.value)}
              placeholder="e.g. Johnson Residence"
              style={flag('customer_name') ? { outline: '1.5px solid #fca5a5', outlineOffset: 2 } : undefined} />
          </Field>

          {/* What kind of order this is. Asked rather than worked out from the
              windows, because a job that has just arrived has none yet — and
              this is the first thing whoever picks it up needs to know. */}
          <Field label="Order type" required>
            <div style={{
              display: 'flex', gap: 8,
              outline: flag('product_type') ? '1.5px solid #fca5a5' : 'none',
              outlineOffset: 3, borderRadius: 9,
            }}>
              {ORDER_TYPES.map(t => {
                const on = form.product_type === t.val
                return (
                  <button key={t.val} type="button"
                    onClick={() => setField('product_type', t.val)}
                    style={{
                      flex: 1, padding: '12px 8px', borderRadius: 9, cursor: 'pointer',
                      fontSize: 14, fontWeight: 600,
                      border: `1.5px solid ${on ? 'var(--accent)' : 'var(--warm-200)'}`,
                      background: on ? 'var(--accent-bg)' : '#fff',
                      color: on ? 'var(--accent-dark)' : 'var(--ink)',
                    }}>
                    <span style={{ fontSize: 18, marginRight: 6 }}>{t.emoji}</span>
                    {t.label}
                  </button>
                )
              })}
            </div>
          </Field>

          <div className="grid-2">
            <Field label="Job date" required>
              <input className="field-input" type="date" value={form.date_invoice}
                onChange={e => setField('date_invoice', e.target.value)}
                style={flag('date_invoice') ? { outline: '1.5px solid #fca5a5', outlineOffset: 2 } : undefined} />
            </Field>
            <Field label="Delivery date" required>
              <input className="field-input" type="date" value={form.delivery_requirement}
                onChange={e => setField('delivery_requirement', e.target.value)}
                style={flag('delivery_requirement') ? { outline: '1.5px solid #fca5a5', outlineOffset: 2 } : undefined} />
            </Field>
          </div>

          <Field label="Job number">
            <input className="field-input" value={form.job_number}
              onChange={e => setField('job_number', e.target.value)} placeholder="Your PO / job number" />
          </Field>

          <div className="grid-2" style={{ marginBottom: 0 }}>
            <Field label="Your name / company" last>
              <input className="field-input" value={form.submitted_by}
                onChange={e => setField('submitted_by', e.target.value)} placeholder="Who's submitting" />
            </Field>
            <Field label="Contact email" last>
              <input className="field-input" type="email" value={form.contact_email}
                onChange={e => setField('contact_email', e.target.value)} placeholder="For any questions" />
            </Field>
          </div>
        </div>

        {tried && (missing.length > 0 || !file) && (
          <div style={{
            background: 'var(--danger-bg)', borderLeft: '3px solid var(--danger)',
            borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginTop: 12,
            fontSize: 12.5, fontWeight: 600, color: 'var(--danger)',
          }}>
            {[...(file ? [] : ['PO PDF']), ...missing].join(', ')} still needed.
          </div>
        )}

        <button
          className="btn btn-primary btn-block btn-lg"
          style={{ marginTop: 16, marginBottom: 32, opacity: submitting ? 0.6 : 1 }}
          disabled={submitting}
          onClick={handleSubmit}
        >
          {submitting ? 'Submitting…' : 'Submit purchase order'}
        </button>
      </div>
      <ToastContainer toasts={toasts} />
    </div>
  )
}

function Header() {
  return (
    <div className="header">
      <img src="/favicon.png" alt="" width={28} height={28} style={{ borderRadius: 6 }} />
      <div className="header-title">Submit a Purchase Order</div>
    </div>
  )
}

function Field({ label, children, last, required }) {
  return (
    <div className="field" style={last ? { marginBottom: 0 } : undefined}>
      <label className="field-label">
        {label}
        {required && (
          <span style={{
            fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '1px 5px',
            borderRadius: 4, background: 'var(--danger-bg)', color: 'var(--danger)',
          }}>required</span>
        )}
      </label>
      {children}
    </div>
  )
}
