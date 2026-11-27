import { useState } from 'react'
import { PlusIcon, ChevronRightIcon } from '../components/Icons'
import NewJobModal from '../components/NewJobModal'
import { STAGES, stageOf } from '../lib/jobStages'

const formatDate = d => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''

// What kind of work is in a job. Deliberately quieter than the stage pill on
// the right — the stage is what you act on, this is what you're looking at.
const TYPE_META = {
  track: { label: 'Tracks', bg: 'var(--accent-bg)',  fg: 'var(--accent-dark)' },
  blind: { label: 'Blinds', bg: 'var(--blue-bg)',    fg: 'var(--blue)' },
}

/** A job's type: what it was created as, else what its windows are. */
function jobType(job, products) {
  if (job.product_type) return job.product_type
  const first = (job.mfg_windows || job.windows || [])
    .map(w => products.find(p => p.id === w.product_id)?.product_type)
    .find(Boolean)
  return first || null
}

// Picked up jobs pile up; the list shows the latest few until asked for more.
const PICKED_UP_SHOWN = 5

const money = n => `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Sell price and margin, once a sell price is in. Margin is against the
 * frozen cost, else today's — the same figure the job's own page shows.
 */
function SellMargin({ job, cost }) {
  if (job.sell_price == null || job.sell_price === '') return null
  const sell = Number(job.sell_price)
  const margin = sell > 0 && cost != null && cost > 0 ? ((sell - cost) / sell) * 100 : null
  const tone = margin == null ? 'var(--warm-300)' : margin < 0 ? 'var(--danger)' : 'var(--accent-dark)'
  return (
    <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 96 }}
      title={cost != null && cost > 0 ? `Cost ${money(cost)}` : 'No cost yet'}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{money(sell)}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: tone }}>
        {margin == null ? 'No cost yet' : `${margin < 0 ? '−' : ''}${Math.abs(margin).toFixed(1)}% margin`}
      </div>
    </div>
  )
}

function JobRow({ job, products, cost, onOpen }) {
  const stage = stageOf(job.status)
  const type  = TYPE_META[jobType(job, products)]
  const count = (job.mfg_windows || job.windows || []).length
  return (
    <div className="component-item" onClick={() => onOpen(job)}>
      <div className="component-avatar">{stage.emoji}</div>
      <div className="component-info">
        <div className="component-name">{job.customer_name || 'Untitled job'}</div>
        <div className="component-sub">
          {job.job_number ? `#${job.job_number} · ` : ''}{formatDate(job.created_at)}
          {' · '}{count} window{count !== 1 ? 's' : ''}
        </div>
      </div>
      <SellMargin job={job} cost={cost} />
      {type && (
        <span style={{
          fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
          background: type.bg, color: type.fg, flexShrink: 0,
        }}>{type.label}</span>
      )}
      <ChevronRightIcon size={16} color="var(--warm-200)" style={{ flexShrink: 0 }} />
    </div>
  )
}

export default function JobList({ jobs, products = [], costs = {}, onOpen, onCreate, creating }) {
  const [newOpen, setNewOpen]       = useState(false)
  const [showAllDone, setShowAllDone] = useState(false)

  const byStage = Object.fromEntries(STAGES.map(s => [s.id, jobs.filter(j => j.status === s.id)]))
  // Anything with a status the app doesn't know yet still shows, under Received.
  const known = new Set(STAGES.map(s => s.id))
  byStage.received = [...byStage.received, ...jobs.filter(j => !known.has(j.status))]

  const jump = (id) => document.getElementById(`stage-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <>
      <div className="header">
        <div className="header-title">Jobs</div>
        <div className="header-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setNewOpen(true)}>
            <PlusIcon size={15} /> New job
          </button>
        </div>
      </div>

      <div className="scroll-area">
        {/* Every stage at a glance; tap one to jump to it. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8, padding: 16 }}>
          {STAGES.map(s => (
            <button key={s.id} className="summary-card" onClick={() => jump(s.id)}
              style={{ cursor: 'pointer', padding: '10px 4px' }}>
              <div className="summary-val">{byStage[s.id].length}</div>
              <div className="summary-lbl">{s.label}</div>
            </button>
          ))}
        </div>

        {STAGES.map(s => {
          let list = byStage[s.id]
          if (list.length === 0) return null
          const isDone = s.id === 'completed'
          const hidden = isDone && !showAllDone ? Math.max(0, list.length - PICKED_UP_SHOWN) : 0
          if (hidden) list = list.slice(0, PICKED_UP_SHOWN)
          return (
            <div key={s.id} id={`stage-${s.id}`} style={{ scrollMarginTop: 70 }}>
              <div className="section-title" style={{ padding: '8px 16px' }}>
                {s.emoji} {s.label} · {byStage[s.id].length}
              </div>
              <div style={{ padding: '0 16px', marginBottom: 16 }}>
                <div className="card">
                  {list.map(job => <JobRow key={job.id} job={job} products={products} cost={costs[job.id]?.cost ?? null} onOpen={onOpen} />)}
                </div>
                {hidden > 0 && (
                  <button className="btn btn-secondary btn-block btn-sm" style={{ marginTop: 8 }}
                    onClick={() => setShowAllDone(true)}>
                    Show {hidden} more
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {jobs.length === 0 && (
          <div style={{ padding: '0 16px' }}>
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <div className="empty-title">Start your first job</div>
                <div className="empty-desc">Jobs from Submit a PO land here too.</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <NewJobModal open={newOpen} onClose={() => setNewOpen(false)} onCreate={onCreate} creating={creating} />
    </>
  )
}
