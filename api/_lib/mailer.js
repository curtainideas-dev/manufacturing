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


