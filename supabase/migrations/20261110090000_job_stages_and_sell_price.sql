-- Phase 2: six job stages, and one sell price per job.
--
-- Stages (mfg_jobs.status):
--   received → to_check → ready → in_progress → made → completed
-- 'in_progress' is now labelled "In production" and 'completed' "Picked up";
-- the ids stay so no existing row has to change for them.

-- Any old check constraint on status (the original schema allowed only
-- draft/confirmed) is replaced by one listing the six stages.
-- Dropped by lookup rather than by name, since it was changed by hand at some
-- point and its name isn't recorded anywhere in this repo.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.mfg_jobs'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.mfg_jobs drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.mfg_jobs
  add constraint mfg_jobs_status_check
  check (status in ('received', 'to_check', 'ready', 'in_progress', 'made', 'completed'));

-- Jobs that were "In Progress" were confirmed but not necessarily started.
-- Decided 2026-11-09: they become Ready to make; each is moved on to
-- In production by hand when work actually begins.
update public.mfg_jobs set status = 'ready' where status = 'in_progress';

-- The sell price for the whole job, typed in from the customer's PO. Cost
-- stays frozen in locked_total; margin is worked out from the two.
alter table public.mfg_jobs add column if not exists sell_price numeric;
