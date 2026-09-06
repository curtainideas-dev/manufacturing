-- Component substitution
--
-- A product's recipe names the component each line is built from. A job does
-- not always agree with it: the shelf holds a different base rail, the
-- customer asked for a heavier profile, the specced part is on back-order.
-- Rather than fork the product for a one-off, a job — or a single window
-- inside it — can swap one component for another.
--
-- Shape, on both tables:
--   { "<recipe component uuid>": { "component_id": "<uuid>",
--                                  "colour_variant": { ... } | null } }
--
-- Keyed by the component the RECIPE asks for, never by whatever it was last
-- swapped to. That makes a swap stable across re-resolution, impossible to
-- chain into itself, and revertible by deleting the key.
--
-- mfg_jobs.substitutions   applies to every window in the job.
-- mfg_windows.substitutions applies to that window only, and wins over the
--                           job's swap of the same part.
--
-- Both are only editable while a job is Received. Once confirmed, the job's
-- price and quantity snapshots are keyed by the component ids the swaps
-- resolved to, so changing them afterwards would orphan the snapshot.

alter table mfg_jobs    add column if not exists substitutions jsonb not null default '{}'::jsonb;
alter table mfg_windows add column if not exists substitutions jsonb not null default '{}'::jsonb;

-- Rollback
-- alter table mfg_jobs    drop column if exists substitutions;
-- alter table mfg_windows drop column if exists substitutions;
