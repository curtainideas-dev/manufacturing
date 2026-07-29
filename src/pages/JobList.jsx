import { useRef, useState, useMemo } from 'react'
import { PlusIcon, ChevronRightIcon } from '../components/Icons'

const formatDate = d => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''

// Visual config per job status
const STATUS_META = {
  received:    { label: 'Received',    emoji: '📥', avatarBg: 'var(--warm-100)',   pill: 'pill-orange' },
  in_progress: { label: 'In Progress', emoji: '🔧', avatarBg: 'var(--accent-bg)',  pill: 'pill-green'  },
  completed:   { label: 'Completed',   emoji: '✅', avatarBg: 'var(--success-bg)', pill: 'pill-green'  },
}

const PERIODS = [
  { id: 'month', label: 'This month' },
  { id: 'year',  label: 'This year' },
  { id: 'all',   label: 'All time' },
]

const fmtMoney = n => Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Completed jobs are dated by manufacture date where set, else when created
const jobDate = (j) => new Date(j.date_manufacture || j.created_at)

export default function JobList({ jobs, onOpen, onNew, onUploadPO, poUploading }) {
  const fileRef    = useRef(null)
  const [period, setPeriod] = useState('month')
  const received   = jobs.filter(j => j.status === 'received')
  const inProgress = jobs.filter(j => j.status === 'in_progress')
  const completed  = jobs.filter(j => j.status === 'completed')

  const completedValue = useMemo(() => {
    const now = new Date()
    const inPeriod = (j) => {
      if (period === 'all') return true
      const d = jobDate(j)
      if (isNaN(d)) return false
      if (d.getFullYear() !== now.getFullYear()) return false
      return period === 'year' || d.getMonth() === now.getMonth()
    }
    const rows = completed.filter(inPeriod)
    return { count: rows.length, total: rows.reduce((s, j) => s + (Number(j.locked_total) || 0), 0) }
  }, [completed, period])

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

        {/* Value of completed jobs */}
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{
            background: 'var(--accent-dark)', color: '#fff',
            borderRadius: 'var(--radius)', padding: '14px 18px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7, marginBottom: 4 }}>
                  Completed Jobs Value
                </div>
                <div style={{ fontSize: 26, fontWeight: 700 }}>${fmtMoney(completedValue.total)}</div>
              </div>
              <div style={{ textAlign: 'right', opacity: 0.75, fontSize: 12 }}>
                {completedValue.count} job{completedValue.count !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              {PERIODS.map(p => (
                <button key={p.id} onClick={() => setPeriod(p.id)} style={{
                  flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 600,
                  borderRadius: 6, cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.25)',
                  background: period === p.id ? 'rgba(255,255,255,0.22)' : 'transparent',
                  color: '#fff', opacity: period === p.id ? 1 : 0.7,
                }}>
                  {p.label}
                </button>
              ))}
            </div>
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
