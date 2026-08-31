/**
 * Request guards for the notification endpoints.
 *
 * Nothing here is user-facing — these endpoints are called only by Supabase
 * database webhooks and by Vercel Cron, so both are protected by a shared
 * secret rather than a login. Secrets live in Vercel env vars, never in .env
 * (that file is committed to the repo).
 */

// Constant-time-ish comparison. Not cryptographically perfect, but it avoids
// leaking secret length via early return on the common case.
function matches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Supabase database webhooks send a custom header we configure in the dashboard.
export function isValidWebhook(req) {
  const expected = process.env.NOTIFY_WEBHOOK_SECRET
  if (!expected) return false
  return matches(req.headers['x-webhook-secret'] || '', expected)
}

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
export function isValidCron(req) {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const header = req.headers.authorization || ''
  return matches(header, `Bearer ${expected}`)
}
