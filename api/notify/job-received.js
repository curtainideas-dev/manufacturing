/**
 * "New order received" — fired by a Supabase database webhook on INSERT
 * into mfg_jobs.
 *
 * Scoped to portal submissions only. Jobs created inside the app start as
 * blank shells (customer_name: '') that get filled in afterwards, so emailing
 * on those would send a stream of empty notifications to the person who just
 * tapped the button.
 */

import { isValidWebhook } from '../_lib/guard.js'
import { renderEmail, sendMail, formatDate } from '../_lib/mailer.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  if (!isValidWebhook(req)) return res.status(401).json({ error: 'unauthorised' })

  const job = req.body?.record
  if (!job) return res.status(200).json({ skipped: 'no record in payload' })

  if (job.source !== 'portal') {
    return res.status(200).json({ skipped: `source=${job.source || 'null'}` })
  }

  const TYPES = { track: 'Tracks', blind: 'Blinds' }
  const rows = [
    ['Type', TYPES[job.product_type] || '—'],
    ['Submitted', formatDate(job.date_invoice || job.created_at)],
  ]
  if (job.submitted_by) rows.push(['Submitted by', job.submitted_by])
  if (job.po_pdf_name)  rows.push(['PO attached', job.po_pdf_name])

  const html = renderEmail({
    title: 'New order received',
    intro: 'A customer submitted an order through the portal. It is waiting in the jobs list as Received.',
    sections: [{ cards: [{
      title: job.customer_name || 'Unnamed customer',
      subtitle: job.job_number ? `Job ${job.job_number}` : 'No job number yet',
      tag: 'Received',
      rows,
    }] }],
    footnote: 'Sent automatically when an order arrives through the customer portal.',
    path:     job.id ? `/manufacturing/jobs/${job.id}` : '',
    button:   'Open the job',
  })

  const result = await sendMail({
    to: process.env.NOTIFY_ORDERS,
    subject: `New order — ${job.customer_name || 'unnamed customer'}`,
    html,
  })

  // Always 200 once authenticated: a mail failure must not make Supabase
  // retry the webhook, and the row is already written either way.
  return res.status(200).json(result)
}
