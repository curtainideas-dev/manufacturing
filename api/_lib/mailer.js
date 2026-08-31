/**
 * Email rendering + delivery via Resend.
 *
 * Sends over plain fetch rather than the Resend SDK, mirroring the project's
 * habit of avoiding build dependencies. Layout is table-based with inline
 * styles because these land in Outlook, which ignores most modern CSS.
 */

const ACCENT      = '#8DC73F'
const ACCENT_DARK = '#1C2E0F'
const ACCENT_BG   = '#F2F9E7'
const BORDER      = '#E4E7E1'
const MUTED       = '#6B7280'

// The app has no router (screens are state in App.jsx), so emails can only
// link to the app root — there are no per-job URLs to deep-link to.
const APP_URL = process.env.APP_URL || ''

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Date-only column (delivery_requirement etc.) rendered without a timezone
// shift — these are calendar dates, not instants.
export function formatDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  if (!y || !m || !d) return String(iso)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`
}

// "Today" in the business's own timezone. Vercel runs UTC, and NZ is 12-13
// hours ahead — without this a job due today reads as due tomorrow.
export function todayISO(tz = process.env.NOTIFY_TIMEZONE || 'Pacific/Auckland') {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Render a notification email.
 *
 * sections: [{ heading?, cards: [{ title, subtitle?, tag?, rows?: [[label, value]] }] }]
 */
export function renderEmail({ title, intro, sections = [], footnote }) {
  const cardHtml = (card) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:10px;margin:0 0 12px 0;">
      <tr><td style="padding:14px 16px;">
        <div style="font:600 15px/1.35 'DM Sans',Arial,sans-serif;color:${ACCENT_DARK};">${esc(card.title)}</div>
        ${card.subtitle ? `<div style="font:400 13px/1.4 Arial,sans-serif;color:${MUTED};margin-top:2px;">${esc(card.subtitle)}</div>` : ''}
        ${card.tag ? `<div style="display:inline-block;margin-top:8px;padding:3px 10px;border-radius:99px;background:${ACCENT_BG};color:${ACCENT_DARK};font:600 12px Arial,sans-serif;">${esc(card.tag)}</div>` : ''}
        ${(card.rows || []).length ? `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:10px;">
          ${card.rows.map(([label, value]) => `
            <tr>
              <td style="padding:2px 14px 2px 0;font:400 13px Arial,sans-serif;color:${MUTED};white-space:nowrap;">${esc(label)}</td>
              <td style="padding:2px 0;font:500 13px Arial,sans-serif;color:#111827;">${esc(value)}</td>
            </tr>`).join('')}
        </table>` : ''}
      </td></tr>
    </table>`

  const sectionHtml = sections.map(s => `
    ${s.heading ? `<div style="font:600 13px Arial,sans-serif;color:${MUTED};text-transform:uppercase;letter-spacing:.04em;margin:18px 0 8px;">${esc(s.heading)}</div>` : ''}
    ${(s.cards || []).map(cardHtml).join('')}`).join('')

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F6F7F5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7F5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid ${BORDER};">
        <tr><td style="background:${ACCENT_DARK};padding:16px 20px;">
          <span style="font:700 16px 'DM Sans',Arial,sans-serif;color:#fff;">Curtain Ideas</span>
          <span style="font:400 13px Arial,sans-serif;color:${ACCENT};margin-left:8px;">Manufacturing</span>
        </td></tr>
        <tr><td style="padding:20px;">
          <div style="font:700 19px/1.3 'DM Sans',Arial,sans-serif;color:${ACCENT_DARK};">${esc(title)}</div>
          ${intro ? `<div style="font:400 14px/1.5 Arial,sans-serif;color:#374151;margin:6px 0 16px;">${esc(intro)}</div>` : '<div style="height:12px;"></div>'}
          ${sectionHtml}
          ${APP_URL ? `<div style="margin-top:18px;">
            <a href="${esc(APP_URL)}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;font:600 14px Arial,sans-serif;padding:10px 18px;border-radius:8px;">Open the app</a>
          </div>` : ''}
          ${footnote ? `<div style="font:400 12px/1.5 Arial,sans-serif;color:${MUTED};margin-top:18px;border-top:1px solid ${BORDER};padding-top:12px;">${esc(footnote)}</div>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

/**
 * Send via Resend. Returns { ok, skipped?, error? } and never throws — a
 * failed notification must not fail the database write that triggered it.
 */
export async function sendMail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY
  const from   = process.env.NOTIFY_FROM

  const recipients = (Array.isArray(to) ? to : String(to || '').split(','))
    .map(s => s.trim()).filter(Boolean)

  if (!apiKey || !from) return { ok: false, skipped: true, error: 'RESEND_API_KEY or NOTIFY_FROM not set' }
  if (!recipients.length) return { ok: false, skipped: true, error: 'no recipients configured' }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: recipients, subject, html }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error('[mail] resend rejected', res.status, body)
      return { ok: false, error: `resend ${res.status}` }
    }
    return { ok: true, to: recipients }
  } catch (err) {
    console.error('[mail] send failed', err)
    return { ok: false, error: String(err) }
  }
}
