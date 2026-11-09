-- Only one email is wanted now: a new job arriving from the portal.
--
-- The "job completed / ready for pickup" trigger goes. The shared function
-- notify_job_event() stays, because mfg_jobs_notify_received still calls it;
-- its UPDATE branch is simply never reached any more.
drop trigger if exists mfg_jobs_notify_completed on public.mfg_jobs;
