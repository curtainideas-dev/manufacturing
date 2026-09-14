-- Ad-hoc BOM lines
--
-- A recipe says what a PRODUCT is made of. A job sometimes needs something the
-- recipe never mentions — a joiner for a track that has to be spliced, a tin of
-- touch-up paint, an hour of someone's time. Until now the only way to handle
-- that was to leave it off the BOM and remember it, which means it is never
-- costed, never picked, and never taken out of stock.
--
-- Shape, on both tables — an array, because order is the order they were added
-- and two different parts are two different lines:
--
--   [ { "component_id": "<uuid>",
--       "colour_variant": { "name": "White", "suffix": "W" } | null,
--       "qty": 2,
--       "note": "spliced at the bay window" | null } ]
--
-- mfg_windows.extra_lines   parts for that window.
-- mfg_jobs.extra_lines      parts for the job, belonging to no one window —
--                           they have no room to sit in on the bill of
--                           materials, so they land in the total alone.
--
-- The same part in the same colour appears at most once per list: two lines
-- pointing at one component would merge in the job summary and collide in the
-- quantity snapshot, which is the same rule substitutions follow.
--
-- Only editable while a job is Received. Once confirmed, the price and
-- quantity snapshots are taken over the lines that existed then, so a line
-- added afterwards would sit outside the snapshot and price at whatever
-- today's cost happens to be.

alter table mfg_jobs    add column if not exists extra_lines jsonb not null default '[]'::jsonb;
alter table mfg_windows add column if not exists extra_lines jsonb not null default '[]'::jsonb;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- select id, job_number, jsonb_array_length(extra_lines) as extras
--   from mfg_jobs where extra_lines <> '[]'::jsonb;
--
-- select w.label, jsonb_array_length(w.extra_lines) as extras
--   from mfg_windows w where w.extra_lines <> '[]'::jsonb;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- alter table mfg_jobs    drop column if exists extra_lines;
-- alter table mfg_windows drop column if exists extra_lines;
