-- A recycle bin for deleted rows
--
-- A job was deleted by accident and there was nothing to undo it with. The row
-- was gone, its windows went with it on cascade, and the only reason it came
-- back at all was that the customer's PO PDF lives in Storage, which the
-- delete path never touched. That is luck, and it only works for jobs that
-- arrived through the portal with a PDF attached. A job typed in by hand, or
-- one with windows on it, would have been unrecoverable.
--
-- So deletes now leave a copy behind.
--
-- Done with a TRIGGER rather than in the app, deliberately. A snapshot written
-- by handleJobDelete would only cover deletes that went through that button --
-- not the SQL editor, not a cascade, not a future code path someone adds. The
-- trigger sits under all of them, which is the only place that can actually
-- promise "nothing is lost".
--
--   table_name   which table the row came from.
--   record_id    its original primary key. Restoring reuses it, so anything
--                that referenced it lines up again.
--   label        a human summary, built at delete time. Needed because the
--                admin list must be readable without unpacking the payload,
--                and because the names it depends on may no longer exist.
--   payload      the row itself, plus its children where it has any. For a
--                job that is { job: {...}, windows: [...] } -- one entry
--                restores the whole thing rather than a shell.
--   restored_at  set when it is put back. Kept rather than deleted, so the
--                bin is also a record of what happened.

create table if not exists deleted_records (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  record_id   uuid not null,
  label       text,
  payload     jsonb not null,
  deleted_at  timestamptz not null default now(),
  restored_at timestamptz
);

create index if not exists deleted_records_open_idx
  on deleted_records(deleted_at desc) where restored_at is null;


-- ------------------------------------------------------------------ jobs --
-- Captures the job AND its windows in one row, because they are one thing to
-- whoever deleted them. Windows are read before the cascade removes them --
-- a BEFORE DELETE trigger on the parent still sees its children.

create or replace function snapshot_deleted_job() returns trigger
language plpgsql security definer as $$
begin
  insert into deleted_records (table_name, record_id, label, payload)
  values (
    'mfg_jobs',
    old.id,
    coalesce(nullif(old.customer_name, ''), 'Untitled job')
      || coalesce(' · #' || old.job_number, '')
      || ' · ' || (select count(*) from mfg_windows w where w.job_id = old.id) || ' windows',
    jsonb_build_object(
      'job',     to_jsonb(old),
      'windows', coalesce(
                   (select jsonb_agg(to_jsonb(w) order by w.sort_order)
                      from mfg_windows w where w.job_id = old.id),
                   '[]'::jsonb)
    )
  );
  return old;
end $$;

drop trigger if exists mfg_jobs_snapshot_delete on mfg_jobs;
create trigger mfg_jobs_snapshot_delete
  before delete on mfg_jobs
  for each row execute function snapshot_deleted_job();


-- --------------------------------------------------------------- windows --
-- One window deleted on its own is worth keeping too. One deleted as part of
-- its job is NOT -- the job's own snapshot already holds it, and a second
-- entry would offer to restore a window into a job that isn't there.
--
-- The parent row is already gone by the time a cascaded child's trigger runs,
-- so its absence is exactly the signal that this is a cascade.

create or replace function snapshot_deleted_window() returns trigger
language plpgsql security definer as $$
declare job_row mfg_jobs%rowtype;
begin
  select * into job_row from mfg_jobs where id = old.job_id;
  if not found then
    return old;   -- cascading from the job; the job's snapshot has it
  end if;

  insert into deleted_records (table_name, record_id, label, payload)
  values (
    'mfg_windows',
    old.id,
    coalesce(nullif(old.label, ''), 'Untitled window')
      || ' · ' || old.width_mm || '×' || old.drop_mm || 'mm'
      || ' · from ' || coalesce(nullif(job_row.customer_name, ''), 'Untitled job'),
    jsonb_build_object('window', to_jsonb(old))
  );
  return old;
end $$;

drop trigger if exists mfg_windows_snapshot_delete on mfg_windows;
create trigger mfg_windows_snapshot_delete
  before delete on mfg_windows
  for each row execute function snapshot_deleted_window();


-- ============================================================================
-- VERIFY  — safe round trip on a throwaway job
-- ============================================================================
-- insert into mfg_jobs (customer_name, status) values ('DELETE ME', 'received');
-- delete from mfg_jobs where customer_name = 'DELETE ME';
-- select table_name, label, deleted_at from deleted_records order by deleted_at desc limit 1;
-- delete from deleted_records where label like 'DELETE ME%';   -- tidy up

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- drop trigger if exists mfg_windows_snapshot_delete on mfg_windows;
-- drop trigger if exists mfg_jobs_snapshot_delete on mfg_jobs;
-- drop function if exists snapshot_deleted_window();
-- drop function if exists snapshot_deleted_job();
-- drop table if exists deleted_records;
