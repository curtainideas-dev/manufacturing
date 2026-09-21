-- ============================================================================
-- Cut plan — leftovers recorded after cutting
--
-- Tracks, tubes and base bars are cut in BULK: the whole job's lengths for a
-- part go through the saw in one session, and what survives is put away
-- afterwards. So the deduction and the leftovers happen at different moments,
-- and the app has to hold onto what it EXPECTED to be left over between them.
--
-- That expectation can't be recomputed later. The moment the deduction lands,
-- the offcuts it consumed are marked used and the bar count drops, so planning
-- the same job again the next morning plans against a different shelf and
-- produces different remainders. It has to be written down when it is known.
--
-- Shape, one entry per bar or offcut the plan consumed that had something
-- left on it:
--   [{ "from": "bar"|"offcut", "from_id": "<stock_bars uuid>"|null,
--      "from_label": "Full bar (6,000mm)", "length_mm": 1450,
--      "label": "Bar 1 rem." }]
--
-- null means "this deduction predates the cut plan" — different from [], which
-- means "planned, and nothing was left over". The record-offcuts step reads
-- them apart: null offers a blank form, [] says there is nothing to record.
--
-- `offcuts_recorded_at` stamps the moment the bench entered the real figures,
-- so the job stops asking. It is deliberately not a boolean: knowing WHEN the
-- leftovers were put away is the difference between "nothing was left" and
-- "nobody has been back to the saw yet".
-- ============================================================================

alter table stock_movements add column if not exists planned_offcuts     jsonb;
alter table stock_movements add column if not exists offcuts_recorded_at timestamptz;

-- Finding the jobs still owing offcuts is the one query this feeds, and it
-- only ever looks at deductions that planned something.
create index if not exists stock_movements_pending_offcuts_idx
  on stock_movements(job_id)
  where planned_offcuts is not null and offcuts_recorded_at is null;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- drop index if exists stock_movements_pending_offcuts_idx;
-- alter table stock_movements
--   drop column if exists planned_offcuts,
--   drop column if exists offcuts_recorded_at;
