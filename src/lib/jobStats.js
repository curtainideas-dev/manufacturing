/**
 * Figures for the Statistics screen.
 *
 * Every job is dated by when it was created (its PO date). A job counts as
 * earned once it is Picked up; until then its sell price is "in the pipeline".
 *
 * Profit is the sell price less the job's cost — the frozen cost once there is
 * one, else today's — the same basis the job's own margin uses. A job counts
 * towards profit and margin only when it has both a sell price and a cost
 * above zero; a cost of nothing means nothing was entered, not a free job.
 */

export const PERIODS = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_3',     label: 'Last 3 months' },
  { id: 'all',        label: 'All time' },
]

export const TYPES = [
  { id: 'all',   label: 'All' },
  { id: 'track', label: 'Tracks' },
  { id: 'blind', label: 'Blinds' },
]

const startOfMonth = (d, back = 0) => new Date(d.getFullYear(), d.getMonth() - back, 1)

/** [from, to) for a period, as dates. `to` is null for "up to now". */
export function periodRange(period, now = new Date()) {
  switch (period) {
    case 'this_month': return [startOfMonth(now), null]
    case 'last_month': return [startOfMonth(now, 1), startOfMonth(now)]
    case 'last_3':     return [startOfMonth(now, 2), null]
    default:           return [null, null]
  }
}

export const jobDate = (job) => job.created_at ? new Date(job.created_at) : null

const num = (v) => (v === null || v === undefined || v === '') ? null : Number(v)

/**
 * One row per job with what the figures need. `costs` maps job id to
 * { cost } (see App's jobCosts); `typeOf` gives a job's type.
 */
export function statRows(jobs, costs, typeOf) {
  return jobs.map(job => {
    const sell = num(job.sell_price)
    const cost = num(costs[job.id]?.cost)
    const costed = sell != null && cost != null && cost > 0
    return {
      job,
      date: jobDate(job),
      type: typeOf(job),
      windows: (job.windows || job.mfg_windows || []).length,
      sell,
      cost,
      costed,
      profit: costed ? sell - cost : null,
      done: job.status === 'completed',
    }
  })
}

export function filterRows(rows, { period = 'all', type = 'all', now = new Date() } = {}) {
  const [from, to] = periodRange(period, now)
  return rows.filter(r => {
    if (type !== 'all' && r.type !== type) return false
    if (from && (!r.date || r.date < from)) return false
    if (to && r.date >= to) return false
    return true
  })
}

const sum = (rows, f) => rows.reduce((s, r) => s + (f(r) || 0), 0)

/** The headline numbers for a set of rows. */
export function summarise(rows) {
  const earnedRows = rows.filter(r => r.done && r.sell != null)
  const costedDone = earnedRows.filter(r => r.costed)
  const pipeline   = rows.filter(r => !r.done && r.sell != null)
  const earned     = sum(earnedRows, r => r.sell)
  const profit     = sum(costedDone, r => r.profit)
  const costedSell = sum(costedDone, r => r.sell)
  const windows    = sum(earnedRows, r => r.windows)
  const losses     = rows.filter(r => r.costed && r.profit < 0)
  return {
    jobsDone:   earnedRows.length,
    earned,
    profit,
    margin:     costedSell > 0 ? (profit / costedSell) * 100 : null,
    avgSell:    earnedRows.length ? earned / earnedRows.length : null,
    windows,
    perWindow:  windows > 0 ? earned / windows : null,
    pipelineJobs: pipeline.length,
    pipeline:   sum(pipeline, r => r.sell),
    losses,
    lossTotal:  sum(losses, r => r.profit),
    uncosted:   earnedRows.length - costedDone.length,
  }
}

/** Margin and counts per type, picked up jobs only. */
export function byType(rows) {
  return ['track', 'blind'].map(type => {
    const done = rows.filter(r => r.done && r.costed && r.type === type)
    const sell = sum(done, r => r.sell)
    const profit = sum(done, r => r.profit)
    return { type, jobs: done.length, margin: sell > 0 ? (profit / sell) * 100 : null, avgSell: done.length ? sell / done.length : null }
  })
}

const weekStart = (d) => {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7))   // back to Monday
  return s
}

/**
 * Picked up jobs bucketed over time: by week for a one-month period, else by
 * month. Every bucket in range is present, empty ones included, so the chart
 * shows a quiet month as a gap rather than skipping it.
 */
export function series(rows, period, now = new Date()) {
  const weekly = period === 'this_month' || period === 'last_month'
  const done = rows.filter(r => r.done && r.sell != null && r.date)
  const [from, to] = periodRange(period, now)
  const first = from || (done.length ? new Date(Math.min(...done.map(r => r.date))) : now)
  const last  = to ? new Date(to - 1) : now

  const buckets = []
  if (weekly) {
    for (let d = weekStart(first); d <= last; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
      buckets.push({ start: d, label: d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) })
    }
  } else {
    for (let d = startOfMonth(first); d <= last; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      buckets.push({ start: d, label: d.toLocaleDateString('en-AU', { month: 'short' }) })
    }
  }
  const keyOf = (date) => (weekly ? weekStart(date) : startOfMonth(date)).getTime()
  const index = new Map(buckets.map((b, i) => [b.start.getTime(), i]))
  const out = buckets.map(b => ({ label: b.label, earned: 0, profit: 0, track: 0, blind: 0, other: 0, windows: 0 }))
  done.forEach(r => {
    const i = index.get(keyOf(r.date))
    if (i === undefined) return
    const b = out[i]
    b.earned += r.sell
    if (r.costed) b.profit += r.profit
    b.windows += r.windows
    if (r.type === 'track') b.track++
    else if (r.type === 'blind') b.blind++
    else b.other++
  })
  // The current bucket is still filling up; say so on the axis.
  const nowKey = keyOf(now)
  buckets.forEach((b, i) => { if (b.start.getTime() === nowKey) out[i].label += '*' })
  return { weekly, points: out }
}
