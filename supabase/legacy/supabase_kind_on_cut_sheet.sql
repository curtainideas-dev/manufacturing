-- Which kinds print on the cut sheet
--
-- The bench needs the base rail and its colour, and the chain length, on the
-- sheet in front of them — not on a BOM they have to go and find. It does not
-- need the tape, the spline, or the incidentals.
--
-- Which parts those are is a fact about the kind, same as everything else that
-- has moved there: a base rail is worth printing wherever it appears, and
-- deciding that per product would mean deciding it again on every product.
--
--   on_cut_sheet   print this kind on the cut sheet, as "<Kind>: <part> · <colour>".
--
-- Separate from ask_on_job on purpose. They answer different questions —
-- "does someone choose this?" and "does the bench need to see it?" — and the
-- answers differ. A chain length is chosen by the drop, so nobody is asked,
-- but the bench absolutely needs to know which one to pick off the rack.

alter table component_kinds add column if not exists on_cut_sheet boolean not null default false;

-- Seed the two that prompted this. Anything else is a tick in Admin.
update component_kinds set on_cut_sheet = true where name in ('Base Rail', 'Chain');
-- Expect: UPDATE 2


-- ============================================================================
-- VERIFY
-- ============================================================================
-- select name, ask_on_job, on_cut_sheet from component_kinds order by sort_order;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- alter table component_kinds drop column if exists on_cut_sheet;
