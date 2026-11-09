-- ============================================================================
-- Which kinds print on the packaging label
--
-- Third tick on a kind, beside ask_on_job and on_cut_sheet, and a third
-- question rather than a rephrasing of either:
--
--   ask_on_job    does someone CHOOSE this when the window goes in?
--   on_cut_sheet  does the BENCH need it while the blind is being made?
--   on_label      does whoever OPENS THE BOX need it?
--
-- They genuinely differ. A chain length matters at the bench and means nothing
-- on a box. A base bar colour matters on both — it is the first thing checked
-- against the order when a blind is unwrapped, and getting it wrong is a
-- remake. Folding the label onto the cut-sheet tick would have made those one
-- decision, and they are not.
--
-- Seeded to Base Rail only. A 62 x 40mm label has room for about four lines
-- of spec; ticking everything would push the size off the bottom of it.
-- ============================================================================

alter table component_kinds add column if not exists on_label boolean not null default false;

update component_kinds set on_label = true where name = 'Base Rail';
-- Expect: UPDATE 1


-- ============================================================================
-- VERIFY
-- ============================================================================
-- select name, ask_on_job, on_cut_sheet, on_label from component_kinds order by sort_order;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- alter table component_kinds drop column if exists on_label;
