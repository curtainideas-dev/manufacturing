-- Job notification triggers
-- ============================================================================
-- Replaces Supabase's Database Webhooks UI (Pro-only) with the thing that UI
-- actually builds underneath: pg_net triggers. Same architecture as designed —
-- the database stays the source of truth, so these fire whichever path changed
-- the row: the ops screen, the /submit portal, or a hand-edited row here in the
-- SQL editor.
--
-- BEFORE RUNNING:
--   1. Replace REPLACE_WITH_WEBHOOK_SECRET below with the value of
--      NOTIFY_WEBHOOK_SECRET from the Vercel project settings. It is deliberately
--      not committed here — this file lives in the repo.
--   2. The api/ endpoints must already be live in production, or the calls just
--      404 (harmlessly, but nothing is sent).
--
-- Endpoints: https://mfg.curtainideas.com.au/api/notify/{job-received,job-completed}

create extension if not exists pg_net;

-- Posts a Supabase-webhook-shaped payload, so the endpoints need no changes:
-- they already read `record` and `old_record` from the body.
create or replace function public.notify_job_event()
returns trigger
language plpgsql
security definer          -- pg_net is not executable by the anon role
set search_path = public
as $$
declare
  endpoint text;
  payload  jsonb;
begin
  if TG_OP = 'INSERT' then
    endpoint := 'https://mfg.curtainideas.com.au/api/notify/job-received';
    payload  := jsonb_build_object(
      'type', 'INSERT', 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW), 'old_record', null);
  else
    endpoint := 'https://mfg.curtainideas.com.au/api/notify/job-completed';
    payload  := jsonb_build_object(
      'type', 'UPDATE', 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW), 'old_record', to_jsonb(OLD));
  end if;

  -- Async: pg_net queues the request and a background worker sends it after
  -- commit, so a slow or unreachable endpoint can never block saving a job.
  perform net.http_post(
    url     := endpoint,
    body    := payload,
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-webhook-secret',  'REPLACE_WITH_WEBHOOK_SECRET'
    ),
    timeout_milliseconds := 5000
  );

  return null;   -- AFTER trigger; return value is ignored
end;
$$;

-- New order received. Portal submissions only: jobs created inside the app
-- start as blank shells that get filled in afterwards, so notifying on those
-- would email the person who just tapped the button.
drop trigger if exists mfg_jobs_notify_received on public.mfg_jobs;
create trigger mfg_jobs_notify_received
  after insert on public.mfg_jobs
  for each row
  when (NEW.source = 'portal')
  execute function public.notify_job_event();

-- Ready for pickup. The WHEN clause is what makes this a status *transition*
-- rather than any edit — handleJobUpdate in App.jsx rewrites the whole row on
-- every field change, so without it this would fire on every keystroke-save.
drop trigger if exists mfg_jobs_notify_completed on public.mfg_jobs;
create trigger mfg_jobs_notify_completed
  after update on public.mfg_jobs
  for each row
  when (NEW.status = 'completed' and OLD.status is distinct from 'completed')
  execute function public.notify_job_event();

-- ============================================================================
-- Verify the triggers exist
--   select tgname, tgenabled from pg_trigger
--   where tgrelid = 'public.mfg_jobs'::regclass and not tgisinternal;
--
-- Inspect recent calls (pg_net logs responses briefly)
--   select id, status_code, error_msg, created
--   from net._http_response order by created desc limit 10;
--
-- Roll back
--   drop trigger if exists mfg_jobs_notify_received  on public.mfg_jobs;
--   drop trigger if exists mfg_jobs_notify_completed on public.mfg_jobs;
--   drop function if exists public.notify_job_event();
-- ============================================================================
