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

/**
 * Three things can be wrong with a part, and they mean different things to
 * whoever is chasing an order:
 *
 *   jobShort    this job alone needs more than is on the shelf. It cannot be
 *               built today, full stop.
 *   shelfShort  everything committed across the in-progress jobs needs more
 *               than is there. This job might still get built — but someone
 *               is going to come up short, so it needs ordering.
 *   belowMin    it all fits; what is left just drops under the reorder point.
 *
 * Kept apart because rolling them into one "parts short" number is what made
 * the old page unreadable, and under-reported besides.
 */
const split = (lines = []) => ({
  blocked: lines.filter(l => l.jobShort),
  ordered: lines.filter(l => !l.jobShort && l.shelfShort),
  low:     lines.filter(l => !l.jobShort && !l.shelfShort && l.belowMin),
})

/**
 * "2.33 metres", "5" — a bare number was half the problem, but "each" is not a
 * unit anybody says out loud. It reads as noise in a label and as a mistake in
 * a sentence ("14 each short"), so only real units are printed.
 */
const qty = (n, unit) => {
  const v = Number(n) || 0
  const num = v % 1 === 0 ? String(v) : v.toFixed(2)
  return unit && unit !== 'each' ? `${num} ${unit}` : num
}

const partName = (l) => `${l.component?.name || 'Unknown part'}${l.colour_variant?.name ? ` · ${l.colour_variant.name}` : ''}`

/**
 * One part, said in full: what this job wants, what is there, who else wants
 * it, and the conclusion. Four short lines rather than one cryptic one —
 * "short 0.33 of 2.33" was arithmetic the reader had to do themselves.
 */
function StockLine({ l, last }) {
  const tone = l.jobShort ? 'var(--danger)' : l.shelfShort ? 'var(--warning)' : 'var(--warm-300)'
  return (
    <div style={{
      padding: '9px 0', fontSize: 12,
      borderTop: last ? 'none' : '1px solid rgba(0,0,0,0.06)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{partName(l)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px' }}>
        <span style={{ color: 'var(--warm-300)' }}>This job needs</span>
        <span style={{ fontWeight: 600 }}>{qty(l.jobQty, l.unit)}</span>
        <span style={{ color: 'var(--warm-300)' }}>In stock</span>
        <span style={{ fontWeight: 600 }}>
          {qty(l.onHand, l.unit)}
          {/* A bar's stock is whole bars plus loose offcuts. Saying so lets
              the figure be checked against the rack, and flags that part of
              it is offcuts, which will not all fit every cut. */}
          {l.fullBars != null && (
            <span style={{ fontWeight: 400, color: 'var(--warm-300)' }}>
              {' '}—{' '}
              {l.fullBars > 0
                ? `${l.fullBars} full bar${l.fullBars !== 1 ? 's' : ''} × ${(l.barMm / 1000).toFixed(1)} m`
                : 'no full bars'}
              {l.pieces > 0
                ? `${l.fullBars > 0 ? ' + ' : ', '}${l.pieces} offcut${l.pieces !== 1 ? 's' : ''} (${qty(l.piecesIn, l.unit)})`
                : ''}
            </span>
          )}
          {l.fullBars == null && l.pieces > 0 && (
            <span style={{ fontWeight: 400, color: 'var(--warm-300)' }}>
              {' '}— {l.pieces} roll{l.pieces !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        {l.otherJobs > 0 && (
          <>
            <span style={{ color: 'var(--warm-300)' }}>Also wanted by</span>
            <span style={{ fontWeight: 600 }}>
              {l.otherJobs} other job{l.otherJobs !== 1 ? 's' : ''} ({qty(l.otherQty, l.unit)})
            </span>
          </>
        )}
      </div>
      <div style={{ marginTop: 5, fontWeight: 700, color: tone }}>
        {l.jobShort
          ? `Not enough for this job on its own — ${qty(l.jobShortBy, l.unit)} short`
          : l.shelfShort
            ? `Enough for this job, but ${qty(l.shelfShortBy, l.unit)} short across all jobs`
            : `Builds fine — would leave ${qty(l.leaves, l.unit)}, below the ${qty(l.minimum, l.unit)} minimum`}
      </div>
    </div>
  )
}

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

export default function TrackPO({ jobs = [], products = [], stockByJob = {}, loading }) {
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
      && split(stockByJob[j.id]).blocked.length > 0).length,
    [jobs, stockByJob])

  const Job = (job) => {
    const open = openId === job.id
    const { blocked, ordered, low } = split(
      job.status === 'in_progress' ? (stockByJob[job.id] || []) : [])
    const all = [...blocked, ...ordered, ...low]
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
              {blocked.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                  background: 'var(--danger-bg)', color: 'var(--danger)',
                }}>
                  ⚠ {blocked.length} part{blocked.length !== 1 ? 's' : ''} not in stock
                </span>
              )}
              {ordered.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                  background: 'var(--warning-bg)', color: 'var(--warning)',
                }}>
                  {ordered.length} short across jobs
                </span>
              )}
              {low.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                  background: 'var(--warm-100)', color: 'var(--warm-300)',
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
            {all.length > 0 && (
              <div style={{
                background: blocked.length ? 'var(--danger-bg)'
                  : ordered.length ? 'var(--warning-bg)' : 'var(--warm-100)',
                borderLeft: `3px solid ${blocked.length ? 'var(--danger)'
                  : ordered.length ? 'var(--warning)' : 'var(--warm-200)'}`,
                borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 12,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.07em', marginBottom: 2,
                  color: blocked.length ? 'var(--danger)'
                    : ordered.length ? 'var(--warning)' : 'var(--warm-300)',
                }}>
                  Stock
                </div>
                {/* Says which question is being answered, because "short" on
                    its own never made clear whether it meant this job or the
                    shelf. Both are answered per part below. */}
                <div style={{ fontSize: 11, color: 'var(--warm-300)', marginBottom: 4, lineHeight: 1.45 }}>
                  Stock is shared across every job being built, so a part can be
                  enough for this one and still run out overall.
                </div>
                {all.map((l, i) => (
                  <StockLine key={i} l={l} last={i === 0} />
                ))}
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
              ⚠ {held} in-progress order{held !== 1 ? 's have' : ' has'} a part that isn’t in stock — open one to see which.
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
