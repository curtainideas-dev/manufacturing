/**
 * "Order complete / ready for pickup" — fired by a Supabase database webhook
 * on UPDATE of mfg_jobs.
 *
 * The webhook sends old_record alongside record, so we can detect the actual
 * status transition. Without that check this would fire on every field edit,
 * because handleJobUpdate in App.jsx writes the whole job on any change.
 */

import { isValidWebhook } from '../_lib/guard.js'
import { supabase, configError } from '../_lib/supabase.js'
import { renderEmail, sendMail, formatDate } from '../_lib/mailer.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  if (!isValidWebhook(req)) return res.status(401).json({ error: 'unauthorised' })
  if (configError) return res.status(500).json({ error: configError })

  const job = req.body?.record
  const old = req.body?.old_record
  if (!job) return res.status(200).json({ skipped: 'no record in payload' })

  const justCompleted = job.status === 'completed' && old?.status !== 'completed'
  if (!justCompleted) {
    return res.status(200).json({ skipped: `${old?.status || '?'} -> ${job.status}` })
  }

  // Window count gives the email some substance; the webhook payload only
  // carries the mfg_jobs row itself.
  let windowCount = null
  const { count, error } = await supabase
    .from('mfg_windows')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', job.id)
  if (!error) windowCount = count

  const rows = [
    ['PO reference', job.po_reference || '—'],
  ]
  if (windowCount !== null) rows.push(['Windows', String(windowCount)])
  rows.push(['Delivery required', formatDate(job.delivery_requirement)])
  if (job.customer_address) rows.push(['Address', job.customer_address])

  const html = renderEmail({
    title: 'Order complete — ready for pickup',
    intro: 'This job has been marked complete and is ready to be collected.',
    sections: [{ cards: [{
      title: job.customer_name || 'Unnamed customer',
      subtitle: job.job_number ? `Job ${job.job_number}` : `Job ${job.id}`,
      tag: 'Completed',
      rows,
    }] }],
    footnote: 'Sent automatically when a job is marked complete in the manufacturing app.',
  })

  const result = await sendMail({
    to: process.env.NOTIFY_PICKUP,
    subject: `Ready for pickup — ${job.customer_name || 'unnamed customer'}${job.job_number ? ` (${job.job_number})` : ''}`,
    html,
  })

  return res.status(200).json(result)
}
