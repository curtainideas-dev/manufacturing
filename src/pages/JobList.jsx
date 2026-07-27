import { useRef } from 'react'
import { PlusIcon, ChevronRightIcon } from '../components/Icons'

const formatDate = d => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''

// Visual config per job status
const STATUS_META = {
  received:    { label: 'Received',    emoji: '📥', avatarBg: 'var(--warm-100)',   pill: 'pill-orange' },
  in_progress: { label: 'In Progress', emoji: '🔧', avatarBg: 'var(--accent-bg)',  pill: 'pill-green'  },
  completed:   { label: 'Completed',   emoji: '✅', avatarBg: 'var(--success-bg)', pill: 'pill-green'  },
}

export default function JobList({ jobs, onOpen, onNew, onUploadPO, poUploading }) {
  const fileRef    = useRef(null)
  const received   = jobs.filter(j => j.status === 'received')
  const inProgress = jobs.filter(j => j.status === 'in_progress')
  const completed  = jobs.filter(j => j.status === 'completed')

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (file) onUploadPO(file)
  }

  const Section = ({ title, list }) => {
    if (list.length === 0) return null
    return (
      <>
        <div className="section-title" style={{ padding: '8px 16px' }}>{title}</div>
        <div style={{ padding: '0 16px', marginBottom: 16 }}>
          <div className="card">
            {list.map(job => {
              const meta = STATUS_META[job.status] || STATUS_META.received
              return (
                <div key={job.id} className="component-item" onClick={() => onOpen(job)}>
                  <div className="component-avatar" style={{ background: meta.avatarBg }}>
                    {meta.emoji}
                  </div>
                  <div className="component-info">
                    <div className="component-name">{job.customer_name || 'Untitled Job'}</div>
                    <div className="component-sub">
                      {job.job_number ? `#${job.job_number} · ` : ''}{formatDate(job.created_at)}
                      {' · '}{(job.mfg_windows || []).length} window{(job.mfg_windows||[]).length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <span className={`pill ${meta.pill}`}>{meta.label}</span>
                  <ChevronRightIcon size={16} color="var(--warm-200)" style={{ flexShrink: 0 }} />
                </div>
              )
            })}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="header">
        <div className="header-title">BOM Generator</div>
        <div className="header-actions">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={poUploading}
            style={{
              padding: '6px 12px', fontSize: 13, fontWeight: 600,
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: poUploading ? 0.6 : 1,
            }}
          >
            📥 {poUploading ? 'Uploading…' : 'Upload PO'}
          </button>
        </div>
      </div>
      <div className="scroll-area">
        <div className="summary-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className="summary-card">
            <div className="summary-val">{received.length}</div>
            <div className="summary-lbl">Received</div>
          </div>
          <div className="summary-card">
            <div className="summary-val">{inProgress.length}</div>
            <div className="summary-lbl">In Progress</div>
          </div>
          <div className="summary-card">
            <div className="summary-val">{completed.length}</div>
            <div className="summary-lbl">Completed</div>
          </div>
        </div>

        <Section title="Received"    list={received} />
        <Section title="In Progress" list={inProgress} />
        <Section title="Completed"   list={completed} />

        {jobs.length === 0 && (
          <div style={{ padding: '0 16px' }}>
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <div className="empty-title">No jobs yet</div>
                <div className="empty-desc">Tap + to create a new job and generate a BOM</div>
              </div>
            </div>
          </div>
        )}
      </div>
      <button className="fab" onClick={onNew}><PlusIcon size={26} /></button>
    </>
  )
}
