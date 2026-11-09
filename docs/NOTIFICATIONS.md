# Email notifications

One automated email: **a new job arrived through the `/submit` portal**. It goes
to the internal addresses in `NOTIFY_ORDERS`. Nothing is sent to customers.

The "ready for pickup", "jobs due soon" and "stock running low" emails were
removed on 2026-11-09. Low stock is now something to look at in the app, not an
email.

## How it fires

A `pg_net` trigger on `mfg_jobs` (`mfg_jobs_notify_received`, insert where
`source = 'portal'`) posts the new row to `/api/notify/job-received`, which
renders the email and sends it through Resend. Jobs created inside the app don't
send anything.

Triggers are used rather than calling the endpoint from the browser so the email
goes out whichever way the row was written. pg_net sends after commit, so a slow
or unreachable endpoint can never block saving a job.

## Setup

1. **Sending domain.** Verify `notifications.curtainideas.com.au` in Resend
   (SPF + DKIM records on the subdomain only) and create an API key.
2. **Vercel environment variables** (never in `.env`, which is committed):
   `RESEND_API_KEY`, `NOTIFY_FROM`, `NOTIFY_ORDERS`, `NOTIFY_WEBHOOK_SECRET`,
   and optionally `APP_URL` so the email links straight to the job.
3. **Database trigger.** Run `supabase/legacy/supabase_job_notifications.sql`
   in the Supabase SQL editor, replacing `REPLACE_WITH_WEBHOOK_SECRET` with the
   `NOTIFY_WEBHOOK_SECRET` value first. Then run
   `supabase/migrations/20261109090000_drop_completed_notification.sql`, which
   removes the old "completed" trigger.

## Testing

The endpoint returns `200` with a `skipped` reason for inserts it ignores (any
job not from the portal), so a `200` in the pg_net log does not by itself mean
an email went out. Check the response body:

```sql
select id, status_code, content, created
from net._http_response order by created desc limit 10;
```

Mail failures never fail the write: `sendMail` returns a result rather than
throwing, and the endpoint always returns `200` once authenticated.
