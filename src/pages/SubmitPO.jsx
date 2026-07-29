import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { extractPdfText, guessFields } from '../lib/pdfExtract'
import { useToast, ToastContainer } from '../hooks/useToast.jsx'

const MAX_MB = 15

const EMPTY = {
  customer_name: '',
  job_number: '',
  date_invoice: '',
  delivery_requirement: '',
  submitted_by: '',
  contact_email: '',
}

export default function SubmitPO() {
  const [file, setFile]             = useState(null)
  const [extracting, setExtracting] = useState(false)
  const [autoFilled, setAutoFilled] = useState(false)
  const [form, setForm]             = useState(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)
  const fileRef = useRef(null)
  const { toasts, showToast } = useToast()

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleFile = async (f) => {
    if (!f) return
    if (f.type !== 'application/pdf') { showToast('Please choose a PDF file', 'error'); return }
    if (f.size > MAX_MB * 1024 * 1024) { showToast(`File too large (max ${MAX_MB}MB)`, 'error'); return }
    setFile(f)
    setAutoFilled(false)

    // Best-effort auto-fill from the PDF text (text-based PDFs only)
    setExtracting(true)
    try {
      const text  = await extractPdfText(f)
      const guess = guessFields(text)
      if (Object.keys(guess).length > 0) {
        // Only fill fields the user hasn't already typed into
        setForm(prev => ({
          ...prev,
          customer_name: prev.customer_name || guess.customer_name || '',
          job_number:    prev.job_number    || guess.po_reference  || '',
          contact_email: prev.contact_email || guess.email         || '',
        }))
        if (guess.customer_name || guess.po_reference) setAutoFilled(true)
      }
    } catch {
      // Silent — extraction is a convenience, not required
    }
    setExtracting(false)
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
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `portal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
    const { error } = await supabase.storage
      .from('customer-orders')
      .upload(path, file, { contentType: 'application/pdf', upsert: false })
    if (error) throw error
    const { data } = supabase.storage.from('customer-orders').getPublicUrl(path)
    return { url: data.publicUrl, name: file.name }
  }

  const handleSubmit = async () => {
    if (!file) { showToast('Please attach the PO PDF', 'error'); return }
    setSubmitting(true)
    try {
      const uploaded = await uploadFile()
      const { error } = await supabase.from('mfg_jobs').insert({
        status:               'received',
        source:               'portal',
        customer_name:        form.customer_name.trim(),
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
    setFile(null); setForm(EMPTY); setDone(false); setAutoFilled(false)
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
          Attach your purchase order PDF and confirm the details below. We’ll create the job automatically.
        </p>

        {/* Drop zone */}
        <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={onInputChange} />
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${file ? 'var(--accent)' : 'var(--warm-200)'}`,
            borderRadius: 'var(--radius)', background: file ? 'var(--accent-bg)' : '#fff',
            padding: '28px 20px', textAlign: 'center', cursor: 'pointer', marginBottom: 8,
            transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: 34, marginBottom: 6 }}>{file ? '📄' : '📎'}</div>
          {file ? (
            <>
              <div style={{ fontWeight: 600, fontSize: 15, wordBreak: 'break-word' }}>{file.name}</div>
              <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 3 }}>
                {extracting ? 'Reading PDF…' : 'Tap to choose a different file'}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Tap to attach PO PDF</div>
              <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 3 }}>or drag &amp; drop · PDF, max {MAX_MB}MB</div>
            </>
          )}
        </div>

        {autoFilled && (
          <div style={{
            fontSize: 12.5, color: 'var(--accent-dark)', background: 'var(--accent-bg)',
            border: '1px solid var(--warm-200)', borderRadius: 'var(--radius-sm)',
            padding: '8px 12px', marginBottom: 16,
          }}>
            ✨ We pre-filled some fields from your PDF — please check they’re correct.
          </div>
        )}

        <div style={{ height: autoFilled ? 0 : 8 }} />

        {/* Fields */}
        <div className="card card-body">
          <Field label="Customer name">
            <input className="field-input" value={form.customer_name}
              onChange={e => setField('customer_name', e.target.value)} placeholder="e.g. Johnson Residence" />
          </Field>

          <div className="grid-2">
            <Field label="Job number">
              <input className="field-input" value={form.job_number}
                onChange={e => setField('job_number', e.target.value)} placeholder="Your PO / job number" />
            </Field>
            <Field label="Invoice date">
              <input className="field-input" type="date" value={form.date_invoice}
                onChange={e => setField('date_invoice', e.target.value)} />
            </Field>
          </div>

          <Field label="Delivery date">
            <input className="field-input" type="date" value={form.delivery_requirement}
              onChange={e => setField('delivery_requirement', e.target.value)} />
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

        <button
          className="btn btn-primary btn-block btn-lg"
          style={{ marginTop: 16, marginBottom: 32, opacity: (submitting || extracting) ? 0.6 : 1 }}
          disabled={submitting || extracting}
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

function Field({ label, children, last }) {
  return (
    <div className="field" style={last ? { marginBottom: 0 } : undefined}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  )
}
