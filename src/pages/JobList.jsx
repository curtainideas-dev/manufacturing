import { PlusIcon, ChevronRightIcon } from '../components/Icons'

const formatDate = d => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''

export default function JobList({ jobs, onOpen, onNew }) {
  const draft     = jobs.filter(j => j.status === 'draft')
  const confirmed = jobs.filter(j => j.status === 'confirmed')

  const JobCard = ({ list, empty }) => (
    <div style={{ padding: '0 16px', marginBottom: 16 }}>
      <div className="card">
        {list.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 20px' }}>
            <div className="empty-icon" style={{ fontSize: 32 }}>📋</div>
            <div className="empty-desc">{empty}</div>
          </div>
        ) : list.map(job => (
          <div key={job.id} className="component-item" onClick={() => onOpen(job)}>
            <div className="component-avatar" style={{ background: job.status === 'confirmed' ? 'var(--success-bg)' : 'var(--accent-bg)' }}>
              {job.status === 'confirmed' ? '✅' : '📋'}
            </div>
            <div className="component-info">
              <div className="component-name">{job.customer_name || 'Untitled Job'}</div>
              <div className="component-sub">
                {job.job_number ? `#${job.job_number} · ` : ''}{formatDate(job.created_at)}
                {' · '}{(job.mfg_windows || []).length} window{(job.mfg_windows||[]).length !== 1 ? 's' : ''}
              </div>
            </div>
            <span className={`pill ${job.status === 'confirmed' ? 'pill-green' : 'pill-orange'}`}>
              {job.status === 'confirmed' ? 'Confirmed' : 'Draft'}
            </span>
            <ChevronRightIcon size={16} color="var(--warm-200)" style={{ flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <>
      <div className="header"><div className="header-title">BOM Generator</div></div>
      <div className="scroll-area">
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-val">{draft.length}</div>
            <div className="summary-lbl">In Progress</div>
          </div>
          <div className="summary-card">
            <div className="summary-val">{confirmed.length}</div>
            <div className="summary-lbl">Confirmed</div>
          </div>
        </div>
        {draft.length > 0 && (
          <>
            <div className="section-title" style={{ padding: '8px 16px' }}>In Progress</div>
            <JobCard list={draft} empty="No draft jobs" />
          </>
        )}
        {confirmed.length > 0 && (
          <>
            <div className="section-title" style={{ padding: '8px 16px' }}>Confirmed</div>
            <JobCard list={confirmed} empty="No confirmed jobs" />
          </>
        )}
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
