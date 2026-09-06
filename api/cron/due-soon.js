/**
 * Daily "jobs due soon" digest, run by Vercel Cron.
 *
 * Deliberately a digest rather than per-job alerts: re-sending today's list is
 * the correct behaviour tomorrow, so it needs no sent-log to avoid duplicates.
 * Overdue jobs are listed first — they matter more than the ones merely due.
 */

import { isValidCron } from '../_lib/guard.js'
import { supabase, configError } from '../_lib/supabase.js'
import { renderEmail, sendMail, formatDate, todayISO, addDays } from '../_lib/mailer.js'

const HORIZON_DAYS = Number(process.env.NOTIFY_DUE_DAYS) || 7
// Ignore ancient unfinished jobs so the digest doesn't accumulate stale noise.
const LOOKBACK_DAYS = 60

export default async function handler(req, res) {
  if (!isValidCron(req)) return res.status(401).json({ error: 'unauthorised' })
  if (configError) return res.status(500).json({ error: configError })

  const today   = todayISO()
  const horizon = addDays(today, HORIZON_DAYS)
  const floor   = addDays(today, -LOOKBACK_DAYS)

  const { data, error } = await supabase
    .from('mfg_jobs')
    .select('id, job_number, customer_name, status, delivery_requirement, date_manufacture')
    .neq('status', 'completed')
    .not('delivery_requirement', 'is', null)
    .gte('delivery_requirement', floor)
    .lte('delivery_requirement', horizon)
    .order('delivery_requirement', { ascending: true })

  if (error) {
    console.error('[due-soon] query failed', error)
    return res.status(500).json({ error: error.message })
  }

  const jobs = data || []
  if (!jobs.length) return res.status(200).json({ skipped: 'nothing due', today, horizon })

  const statusLabel = { received: 'Received', in_progress: 'In progress' }
  const toCard = (job) => ({
    title: job.customer_name || 'Unnamed customer',
    subtitle: job.job_number ? `Job ${job.job_number}` : `Job ${job.id}`,
    tag: statusLabel[job.status] || job.status,
    rows: [
      ['Delivery required', formatDate(job.delivery_requirement)],
      ['Manufacture date', formatDate(job.date_manufacture)],
    ],
  })

  const overdue  = jobs.filter(j => j.delivery_requirement < today)
  const upcoming = jobs.filter(j => j.delivery_requirement >= today)

  const sections = []
  if (overdue.length)  sections.push({ heading: `Overdue (${overdue.length})`,  cards: overdue.map(toCard) })
  if (upcoming.length) sections.push({ heading: `Due within ${HORIZON_DAYS} days (${upcoming.length})`, cards: upcoming.map(toCard) })

  const html = renderEmail({
    title: 'Jobs due soon',
    intro: `${jobs.length} open job${jobs.length !== 1 ? 's' : ''} need${jobs.length === 1 ? 's' : ''} attention${overdue.length ? `, including ${overdue.length} already overdue` : ''}.`,
    sections,
    footnote: 'Daily digest of jobs that are not yet complete and have a delivery date approaching or past.',
  })

  const result = await sendMail({
    to: process.env.NOTIFY_ORDERS,
    subject: overdue.length
      ? `${overdue.length} job${overdue.length !== 1 ? 's' : ''} overdue, ${upcoming.length} due soon`
      : `${upcoming.length} job${upcoming.length !== 1 ? 's' : ''} due in the next ${HORIZON_DAYS} days`,
    html,
  })

  return res.status(200).json({ ...result, counted: jobs.length })
}
