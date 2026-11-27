import { useEffect, useMemo, useRef, useState } from 'react'
import DraftInput from '../components/DraftInput'
import InfoTip from '../components/InfoTip'
import { stageOf } from '../lib/jobStages'
import { PERIODS, TYPES, statRows, filterRows, summarise, byType, series } from '../lib/jobStats'

const money  = (n) => n == null ? '—' : `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`
const money2 = (n) => n == null ? '—' : `${n < 0 ? '−' : ''}$${Math.abs(Number(n)).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct    = (n) => n == null ? '—' : `${n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}%`
const fmtDate = (d) => d ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

const C_EARNED = 'var(--accent-dark)'
const C_PROFIT = 'var(--accent)'
const C_TRACK  = 'var(--accent-dark)'
const C_BLIND  = 'var(--blue)'
const C_OTHER  = 'var(--warm-300)'

function Tile({ label, value, sub, tip, tone }) {
  return (
    <div className="summary-card" style={{ textAlign: 'left', borderColor: tone === 'danger' ? 'var(--danger)' : undefined }}>
      <div style={{ fontSize: 12.5, color: tone === 'danger' ? 'var(--danger)' : 'var(--warm-300)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}{tip && <InfoTip>{tip}</InfoTip>}
      </div>
      <div className="summary-val" style={{ fontSize: 24, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--warm-300)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Legend({ items }) {
  return (
    <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--warm-300)', marginBottom: 6 }}>
      {items.map(([label, color]) => (
        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: color }} />{label}
        </span>
      ))}
    </div>
  )
}

const niceMax = (v) => {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= v)
}

/** The width of an element, kept up to date as it resizes. */
function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/**
 * A plain SVG bar chart: grouped (side by side) or stacked. No chart library;
 * each bar has a <title> so hovering shows its value. Drawn at its real width
 * so the labels stay the same size however wide the screen is.
 */
function BarChart(props) {
  const [ref, width] = useWidth()
  return <div ref={ref} style={{ height: props.height || 200 }}>{width > 0 && <Bars {...props} width={width} />}</div>
}

function Bars({ points, keys, stacked = false, format = String, height = 200, width }) {
  const W = width, H = height, L = 56, B = 22, T = 8
  const totals = points.map(p => stacked ? keys.reduce((s, k) => s + Math.max(0, p[k.id]), 0) : Math.max(0, ...keys.map(k => p[k.id])))
  const max = niceMax(Math.max(0, ...totals))
  const y = (v) => T + (H - T - B) * (1 - v / max)
  const slot = (W - L) / Math.max(1, points.length)
  const groupW = Math.min(slot * 0.7, stacked ? 26 : 44)
  const barW = stacked ? groupW : groupW / keys.length - 2
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * max)
  return (
    <svg width={W} height={H} role="img" style={{ display: 'block' }}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="var(--warm-200)" strokeWidth="1" />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--warm-300)">{format(t)}</text>
        </g>
      ))}
      {points.map((p, i) => {
        const x0 = L + slot * i + (slot - groupW) / 2
        let acc = 0
        return (
          <g key={i}>
            {keys.map((k, j) => {
              const v = Math.max(0, p[k.id])
              if (!v) return null
              const top = stacked ? y(acc + v) : y(v)
              const bottom = stacked ? y(acc) : y(0)
              const x = stacked ? x0 : x0 + j * (barW + 2)
              acc += v
              return (
                <rect key={k.id} x={x} y={top} width={barW} height={Math.max(0, bottom - top - (stacked ? 1 : 0))} rx="3" fill={k.color}>
                  <title>{`${p.label} · ${k.label}: ${format(p[k.id])}`}</title>
                </rect>
              )
            })}
            <text x={L + slot * i + slot / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--warm-300)">{p.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

function Section({ title, tip, children, right }) {
  return (
    <div style={{ padding: '0 16px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 0 8px' }}>
        <div className="section-title" style={{ padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>{title}{tip && <InfoTip>{tip}</InfoTip>}</div>
        {right}
      </div>
      {children}
    </div>
  )
}

function JobLine({ r, onOpen, right }) {
  return (
    <div className="component-item" onClick={() => onOpen(r.job)} style={{ gap: 10 }}>
      <div className="component-info">
        <div className="component-name">{r.job.customer_name || 'Untitled job'}</div>
        <div className="component-sub">{r.job.job_number ? `#${r.job.job_number} · ` : ''}{fmtDate(r.date)} · {stageOf(r.job.status).label}</div>
      </div>
      {right}
    </div>
  )
}

export default function StatsPage({ jobs, costs, typeOf, onOpen, onSetSellPrice }) {
  const [period, setPeriod] = useState('all')
  const [type, setType]     = useState('all')

  const all   = useMemo(() => statRows(jobs, costs, typeOf), [jobs, costs, typeOf])
  const rows  = useMemo(() => filterRows(all, { period, type }), [all, period, type])
  const s     = useMemo(() => summarise(rows), [rows])
  const types = useMemo(() => byType(filterRows(all, { period })), [all, period])
  const time  = useMemo(() => series(rows, period), [rows, period])

  // Every job still without a sell price, whatever the filters, newest first.
  const unpriced = all.filter(r => r.sell == null).sort((a, b) => (b.date || 0) - (a.date || 0))
  const top = rows.filter(r => r.done && r.costed).sort((a, b) => b.profit - a.profit).slice(0, 5)
  const losses = [...s.losses].sort((a, b) => a.profit - b.profit)
  const empty = s.jobsDone === 0

  return (
    <>
      <div className="header">
        <div className="header-title">Statistics</div>
      </div>

      <div className="scroll-area">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, padding: 16 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PERIODS.map(p => (
              <button key={p.id} className={`btn btn-sm ${period === p.id ? 'btn-primary' : 'btn-secondary'}`}
                aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {TYPES.map(t => (
              <button key={t.id} className={`btn btn-sm ${type === t.id ? 'btn-primary' : 'btn-secondary'}`}
                aria-pressed={type === t.id} onClick={() => setType(t.id)}>{t.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, padding: '0 16px 10px' }}>
          <Tile label="Total earned" value={money(s.earned)} sub={`${s.jobsDone} job${s.jobsDone !== 1 ? 's' : ''} picked up`}
            tip="Sell prices of jobs that have been picked up, dated by when the job came in." />
          <Tile label="Total profit" value={money(s.profit)} sub="Sell price less cost"
            tip="Each job's sell price less its frozen cost (today's cost if it isn't frozen yet). Jobs with no cost recorded are left out." />
          <Tile label="Margin" value={pct(s.margin)} sub="Profit ÷ sell price" />
          <Tile label="Average sell price" value={money(s.avgSell)} sub="Per job" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, padding: '0 16px 18px' }}>
          <Tile label="Windows made" value={s.windows.toLocaleString()} />
          <Tile label="Sell per window" value={money(s.perWindow)} />
          <Tile label="In the pipeline" value={money(s.pipeline)} sub={`${s.pipelineJobs} job${s.pipelineJobs !== 1 ? 's' : ''} not picked up yet`}
            tip="Sell prices of jobs that are priced but not picked up yet. Not counted in earned or profit." />
          <Tile label="Sold below cost" tone={losses.length ? 'danger' : undefined}
            value={`${losses.length} job${losses.length !== 1 ? 's' : ''}`} sub={losses.length ? `${money(s.lossTotal)} in total` : 'None'} />
        </div>

        {empty ? (
          <div style={{ padding: '0 16px 18px' }}>
            <div className="card"><div className="empty-state">
              <div className="empty-icon">📊</div>
              <div className="empty-title">No picked up jobs in this period</div>
              <div className="empty-desc">Choose a longer period, or add sell prices below.</div>
            </div></div>
          </div>
        ) : (
          <>
            <Section title={`Earned and profit by ${time.weekly ? 'week' : 'month'}`}
              tip="Picked up jobs only. A * marks a week or month that isn't over yet.">
              <div className="card card-body">
                <Legend items={[['Earned', C_EARNED], ['Profit', C_PROFIT]]} />
                <BarChart points={time.points} format={money}
                  keys={[{ id: 'earned', label: 'Earned', color: C_EARNED }, { id: 'profit', label: 'Profit', color: C_PROFIT }]} />
              </div>
            </Section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 0 }}>
              <Section title={`Jobs picked up by ${time.weekly ? 'week' : 'month'}`}>
                <div className="card card-body">
                  <Legend items={[['Tracks', C_TRACK], ['Blinds', C_BLIND], ...(time.points.some(p => p.other) ? [['Not set', C_OTHER]] : [])]} />
                  <BarChart points={time.points} stacked height={180} format={v => String(Math.round(v))}
                    keys={[{ id: 'track', label: 'Tracks', color: C_TRACK }, { id: 'blind', label: 'Blinds', color: C_BLIND }, { id: 'other', label: 'Not set', color: C_OTHER }]} />
                </div>
              </Section>

              <Section title="Margin by type">
                <div className="card card-body">
                  {types.map(t => (
                    <div key={t.type} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 5 }}>
                        <span>{t.type === 'track' ? 'Tracks' : 'Blinds'} · {t.jobs} job{t.jobs !== 1 ? 's' : ''} · avg {money(t.avgSell)}</span>
                        <strong>{pct(t.margin)}</strong>
                      </div>
                      <div style={{ height: 8, borderRadius: 4, background: 'var(--warm-100)' }}>
                        <div style={{ width: `${Math.max(0, Math.min(100, t.margin || 0))}%`, height: '100%', borderRadius: 4, background: t.type === 'track' ? C_TRACK : C_BLIND }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: 'var(--warm-300)' }}>Picked up jobs in the chosen period, both types.</div>
                </div>
              </Section>
            </div>

            {top.length > 0 && (
              <Section title="Most profitable jobs">
                <div className="card">
                  {top.map(r => (
                    <JobLine key={r.job.id} r={r} onOpen={onOpen} right={
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700 }}>{money(r.profit)}</div>
                        <div style={{ fontSize: 12, color: 'var(--warm-300)' }}>{pct(r.profit / r.sell * 100)} of {money(r.sell)}</div>
                      </div>} />
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {losses.length > 0 && (
          <Section title="Sold below cost" tip="Jobs in the chosen period whose sell price is less than their cost, at any stage.">
            <div className="card">
              {losses.map(r => (
                <JobLine key={r.job.id} r={r} onOpen={onOpen} right={
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, color: 'var(--danger)' }}>{money2(r.profit)}</div>
                    <div style={{ fontSize: 12, color: 'var(--warm-300)' }}>sell {money2(r.sell)} · cost {money2(r.cost)}</div>
                  </div>} />
              ))}
            </div>
          </Section>
        )}

        <Section title={`Needs a sell price · ${unpriced.length}`}
          tip="Every job without a sell price, whatever the filters above. Type the total from the customer's PO, excluding GST; it saves when you leave the box or press Enter.">
          <div className="card">
            {unpriced.length === 0 && (
              <div className="empty-state" style={{ padding: 20 }}><div className="empty-desc">Every job has a sell price.</div></div>
            )}
            {unpriced.map(r => (
              <JobLine key={r.job.id} r={r} onOpen={onOpen} right={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <span style={{ fontSize: 12, color: 'var(--warm-300)', textAlign: 'right' }}>
                    cost {r.cost != null && r.cost > 0 ? money2(r.cost) : '—'}
                  </span>
                  <DraftInput className="field-input" type="number" step="0.01" min="0"
                    style={{ width: 130, padding: '6px 10px' }}
                    aria-label={`Sell price for ${r.job.customer_name || 'untitled job'}`}
                    value="" placeholder="Sell price ($)"
                    parse={v => v === '' ? null : Number(v)}
                    onCommit={v => { if (v != null && !Number.isNaN(v)) onSetSellPrice(r.job.id, v) }} />
                </div>} />
            ))}
          </div>
        </Section>
      </div>
    </>
  )
}
