# Email notifications

Four automated emails, all to internal `@curtainideas` addresses. Nothing is
sent to customers, so no email is gated on customer data quality.

| Email | Trigger | Recipient var |
|---|---|---|
| New order received | Supabase webhook — INSERT on `mfg_jobs`, portal submissions only | `NOTIFY_ORDERS` |
| Order complete, ready for pickup | Supabase webhook — UPDATE on `mfg_jobs` where status becomes `completed` | `NOTIFY_PICKUP` |
| Jobs due soon (daily digest) | Vercel Cron, ~07:00 AEST | `NOTIFY_ORDERS` |
| Stock running low (daily digest) | Vercel Cron, ~07:30 AEST | `NOTIFY_STOCK` |

No schema changes were needed. The code lives in `api/`, which Vercel picks up
as serverless functions automatically on push — same deploy pipeline as the app.

## Why webhooks rather than calling an endpoint from App.jsx

The database is the source of truth, so these fire whichever path caused the
change — the ops screen, the `/submit` portal, or a hand-edited row. The webhook
payload also carries `old_record`, which is what makes "status *became*
completed" detectable. Without it the pickup email would fire on every field
edit, because `handleJobUpdate` writes the whole job on any change.

## Setup

### 1. Sending domain (do this first — it's the only step outside the repo)

Resend's shared test domain only delivers to your own account address, so it
can't reach several internal mailboxes. You need a verified domain.

Verify a **subdomain** — `notifications.curtainideas.com.au` — not the root
domain. The DNS records are scoped to the subdomain and never touch the records
governing real company mail, so a mistake here cannot disrupt actual email.

1. Sign up at [resend.com](https://resend.com), add the subdomain.
2. Add the SPF + DKIM records it gives you to DNS.
3. Create an API key.

If anything lands in spam, allowlist the sender in your own tenant — you control
the receiving end.

### 2. Vercel environment variables

Settings → Environment Variables. See `.env.example` for the full list.

**Do not put any of these in `.env` — that file is committed to this repo.**

Required: `RESEND_API_KEY`, `NOTIFY_FROM`, `NOTIFY_ORDERS`, `NOTIFY_PICKUP`,
`NOTIFY_STOCK`, `NOTIFY_WEBHOOK_SECRET`, `CRON_SECRET`.

Generate the two secrets with any random string, e.g.:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Recipient vars accept a comma-separated list for more than one address.

### 3. Supabase database webhooks

Dashboard → Database → Webhooks → Create a new hook. Two hooks, both HTTP POST,
both with the header `x-webhook-secret` set to `NOTIFY_WEBHOOK_SECRET`:

| Name | Table | Events | URL |
|---|---|---|---|
| `job_received` | `mfg_jobs` | Insert | `https://<your-app>/api/notify/job-received` |
| `job_completed` | `mfg_jobs` | Update | `https://<your-app>/api/notify/job-completed` |

Both endpoints filter in code — the insert hook ignores anything that isn't a
portal submission, and the update hook ignores everything but a genuine
transition into `completed`.

### 4. Cron

Already declared in `vercel.json`; it activates on deploy. Vercel's Hobby tier
allows two daily cron jobs, which is exactly what this uses — a third would need
a paid plan or merging the digests.

Schedules are in UTC (`0 21` and `30 21`), landing ~7am on the Australian east
coast. The exact local time shifts an hour with daylight saving, and Hobby-tier
crons fire within roughly an hour of the stated time. Neither matters for a
daily digest.

## Testing

Recipients and both secrets can be changed without touching code. To verify a
cron endpoint against the deployed app:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/cron/due-soon
```

It returns JSON describing what it did — `{"ok":true,...}`, or `{"skipped":...}`
when there is nothing to report. Both digests deliberately send nothing when
there is nothing due or nothing below minimum.

The webhook endpoints return `200` with a `skipped` reason for events they
intentionally ignore, so a `200` in the Supabase webhook log does not by itself
mean an email went out — check the response body.

## Design notes

- **Digests, not per-item alerts.** Re-sending today's list tomorrow is correct
  behaviour, so the scheduled emails need no sent-log to avoid duplicates.
- **No dedupe table.** A job reopened and re-completed sends a second pickup
  email. Internally that is harmless; if it becomes noisy, add a
  `notification_log` table with a unique constraint on `(kind, ref_id)`.
- **Timezone.** "Today" is computed in `NOTIFY_TIMEZONE` (default
  `Australia/Sydney`). Vercel runs UTC, and AEST is 10–11 hours ahead — without
  this a job due today would read as due tomorrow.
- **No deep links.** The app has no router (screens are state in `App.jsx`), so
  emails link to the app root via `APP_URL`. Per-job links would need routing.
- **Low stock is a full sweep**, unlike `checkAndGeneratePOs` in `App.jsx` which
  only inspects components touched by a deduction. The sweep also catches
  shortfalls that predate the last job. It does not create draft POs — that
  stays with the existing hook.
- **Mail failures never fail the write.** `sendMail` returns a result rather
  than throwing, and the webhook endpoints always return `200` once
  authenticated, so Supabase does not retry into duplicate sends.
