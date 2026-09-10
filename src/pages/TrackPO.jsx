import { useState, useMemo } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '../components/Icons'
import { productTypesIn } from './JobList'

/**
 * Where every order is up to.
 *
 * Read-only on purpose. This is the screen for the person who sent the order
 * in and wants to know what happened to it, not for the person building it —
 * so it answers "which stage, and is anything holding it up" and stops there.
 * No prices, no BOM, no editing; those live in Manufacturing.
 *
 * The stock flag only appears on In Progress, because that is the only stage
 * where a shortage means anything. A Received job has not been committed to
 * yet, and a Completed one was already built.
 */

const STATUS = [
  { id: 'received',    label: 'Received',    emoji: '📥', blurb: 'Order is in, not started yet' },
  { id: 'in_progress', label: 'In Progress', emoji: '🔧', blurb: 'Being built' },
  { id: 'completed',   label: 'Completed',   emoji: '✅', blurb: 'Ready or delivered' },
]

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—'

const fmtQty = (n) => {
  const v = Number(n) || 0
  return v % 1 === 0 ? String(v) : v.toFixed(2)
}

/**
 * checkLowStock flags anything that would drop BELOW ITS MINIMUM, which is not
 * the same as running out — a part with ten on hand, ten needed and a minimum
 * of two is flagged, and calling that "short" is wrong. It builds fine; it just
 * leaves the shelf bare.
 *
 * The two matter differently to whoever is chasing an order: one stops the job,
 * the other only means reorder soon. So they are counted and worded apart.
 */
const splitAlerts = (alerts = []) => ({
  blocking: alerts.filter(a => Number(a.qty_after) < 0),
  low:      alerts.filter(a => Number(a.qty_after) >= 0),
})

function Detail({ label, value }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.07em', color: 'var(--warm-300)',
      }}>{label}</div>
      <div style={{ fontSize: 13, marginTop: 2 }}>{value}</div>
    </div>
  )
}

export default function TrackPO({ jobs = [], products = [], shortagesByJob = {}, loading }) {
  const [openId, setOpenId] = useState(null)
  const [search, setSearch] = useState('')

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return jobs
    return jobs.filter(j =>
      (j.customer_name || '').toLowerCase().includes(q) ||
      (j.job_number || '').toLowerCase().includes(q) ||
      (j.submitted_by || '').toLowerCase().includes(q))
  }, [jobs, search])

  const held = useMemo(
    () => jobs.filter(j => j.status === 'in_progress'
      && splitAlerts(shortagesByJob[j.id]).blocking.length > 0).length,
    [jobs, shortagesByJob])

  const Job = (job) => {
    const open = openId === job.id
    const { blocking, low } = splitAlerts(
      job.status === 'in_progress' ? (shortagesByJob[job.id] || []) : [])
    const short = [...blocking, ...low]
    const types = productTypesIn(job, products)
    const windows = job.windows || []

    return (
      <div key={job.id} style={{ borderBottom: '1px solid var(--warm-100)' }}>
        <div className="component-item" onClick={() => setOpenId(open ? null : job.id)}>
          <div className="component-info">
            <div className="component-name">{job.customer_name || 'Untitled job'}</div>
            <div className="component-sub">
              {job.job_number ? `#${job.job_number} · ` : ''}
              {windows.length} window{windows.length !== 1 ? 's' : ''}
              {job.delivery_requirement ? ` · due ${fmtDate(job.delivery_requirement)}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
              {types.map(t => (
                <span key={t.type} style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px',
                  borderRadius: 4, background: t.meta.bg, color: t.meta.fg,
                }}>
                  {t.meta.label}{t.showCount ? ` ${t.count}` : ''}
                </span>
              ))}
              {blocking.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                  background: 'var(--danger-bg)', color: 'var(--danger)',
                }}>
                  ⚠ {blocking.length} part{blocking.length !== 1 ? 's' : ''} short
                </span>
              )}
              {low.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                  background: 'var(--warning-bg)', color: 'var(--warning)',
                }}>
                  {low.length} running low
                </span>
              )}
            </div>
          </div>
          <ChevronRightIcon size={16} color="var(--warm-200)" style={{
            flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s',
          }} />
        </div>

        {open && (
          <div style={{ padding: '4px 16px 16px', background: 'var(--warm-100)' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
              padding: '12px 0',
            }}>
              <Detail label="Submitted" value={fmtDate(job.created_at)} />
              <Detail label="By" value={job.submitted_by || '—'} />
              <Detail label="Job date" value={fmtDate(job.date_invoice)} />
              <Detail label="Delivery" value={fmtDate(job.delivery_requirement)} />
            </div>

            {job.po_pdf_url && (
              <a href={job.po_pdf_url} target="_blank" rel="noreferrer"
                style={{
                  display: 'inline-block', fontSize: 12.5, fontWeight: 600,
                  color: 'var(--accent-dark)', textDecoration: 'none',
                  padding: '7px 11px', borderRadius: 'var(--radius-sm)',
                  background: '#fff', border: '1px solid var(--warm-200)', marginBottom: 12,
                }}>
                📄 {job.po_pdf_name || 'View the PO'}
              </a>
            )}

            {/* What is actually holding it up. The whole reason someone opens
                a tracking page on a job that is late. */}
            {short.length > 0 && (
              <div style={{
                background: blocking.length ? 'var(--danger-bg)' : 'var(--warning-bg)',
                borderLeft: `3px solid ${blocking.length ? 'var(--danger)' : 'var(--warning)'}`,
                borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 12,
              }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, marginBottom: 6,
                  color: blocking.length ? 'var(--danger)' : 'var(--warning)',
                }}>
                  {blocking.length
                    ? `Not enough stock to build ${blocking.length === 1 ? 'one part' : 'these parts'}`
                    : 'Enough to build — but these drop below their minimum'}
                </div>
                {short.map((a, i) => {
                  const after = Number(a.qty_after)
                  const isBlocking = after < 0
                  return (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', gap: 10,
                      fontSize: 12, padding: '3px 0',
                    }}>
                      <span>
                        {a.component?.name || 'Unknown part'}
                        {a.colour_variant?.name ? ` · ${a.colour_variant.name}` : ''}
                      </span>
                      <span style={{
                        fontWeight: 700, flexShrink: 0,
                        color: isBlocking ? 'var(--danger)' : 'var(--warning)',
                      }}>
                        {isBlocking
                          ? `short ${fmtQty(Math.abs(after))} of ${fmtQty(a.qty_required)}`
                          : `leaves ${fmtQty(after)}, min ${fmtQty(a.qty_minimum)}`}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {windows.length > 0 && (
              <>
                <div style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.07em', color: 'var(--warm-300)', marginBottom: 5,
                }}>
                  Windows
                </div>
                <div style={{ background: '#fff', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  {windows.map((w, i) => {
                    const product = products.find(p => p.id === w.product_id)
                    return (
                      <div key={w.id} style={{
                        display: 'flex', justifyContent: 'space-between', gap: 10,
                        padding: '8px 11px', fontSize: 12.5,
                        borderTop: i ? '1px solid var(--warm-100)' : 'none',
                      }}>
                        <span>{w.label || `Window ${i + 1}`}</span>
                        <span style={{ color: 'var(--warm-300)', flexShrink: 0 }}>
                          {product?.name ? `${product.name} · ` : ''}
                          {w.width_mm} × {w.drop_mm}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="header">
        <a href="/" className="header-back" style={{ textDecoration: 'none' }}>
          <ChevronLeftIcon size={18} /> Home
        </a>
        <div className="header-title" style={{ fontSize: 15 }}>Track a PO</div>
      </div>

      <div className="scroll-area">
        <div className="summary-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {STATUS.map(s => (
            <div className="summary-card" key={s.id}>
              <div className="summary-val">{jobs.filter(j => j.status === s.id).length}</div>
              <div className="summary-lbl">{s.label}</div>
            </div>
          ))}
        </div>

        {held > 0 && (
          <div style={{ padding: '0 16px 12px' }}>
            <div style={{
              background: 'var(--danger-bg)', borderLeft: '3px solid var(--danger)',
              borderRadius: 'var(--radius-sm)', padding: '10px 13px',
              fontSize: 12.5, color: 'var(--danger)', fontWeight: 600,
            }}>
              ⚠ {held} in-progress order{held !== 1 ? 's do' : ' does'} not have enough stock to build — open one to see what.
            </div>
          </div>
        )}

        <div style={{ padding: '0 16px 12px' }}>
          <input className="field-input" placeholder="Search customer, job number or who sent it…"
            value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: 14 }} />
        </div>

        {loading ? (
          <div style={{ padding: '0 16px' }}>
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon">⏳</div>
                <div className="empty-title">Loading orders…</div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '0 16px 24px' }}>
            {STATUS.map(s => {
              const list = shown.filter(j => j.status === s.id)
              if (list.length === 0) return null
              return (
                <div key={s.id}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '16px 0 8px' }}>
                    <span style={{ fontSize: 16 }}>{s.emoji}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.1em', color: 'var(--warm-300)',
                    }}>{s.label}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--warm-300)',
                      background: 'var(--warm-100)', borderRadius: 99, padding: '1px 8px',
                    }}>{list.length}</span>
                    <span style={{ fontSize: 11, color: 'var(--warm-300)', marginLeft: 'auto' }}>
                      {s.blurb}
                    </span>
                  </div>
                  <div className="card">{list.map(Job)}</div>
                </div>
              )
            })}

            {shown.length === 0 && (
              <div className="card" style={{ marginTop: 16 }}>
                <div className="empty-state">
                  <div className="empty-icon">🔎</div>
                  <div className="empty-title">{jobs.length === 0 ? 'No orders yet' : 'No matches'}</div>
                  <div className="empty-desc">
                    {jobs.length === 0
                      ? 'Orders submitted through the portal will show up here.'
                      : 'Try a different search.'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
