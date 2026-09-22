-- ============================================================================
-- APPLIED 2026-09-22 via the Supabase CLI — see
-- supabase/migrations/20260922023800_po_line_overrides.sql, which is the copy
-- that actually ran. This file is the annotated record of WHY; that one is the
-- executable statement. Change both or neither.
--
-- Purchase order lines: say it the supplier's way
--
-- A line's description and order unit were both derived from the component —
-- our name for the part, and a unit worked out from how we stock it. That is
-- right for the workshop and often wrong on a document going to someone else:
--
--   they call it something different    "Q-Bar 5.4m" where we say "TBS Q-Bar
--                                       Base Rail", and an order that does not
--                                       use their words gets queried.
--   the unit is theirs, not ours        we derive "pack of 50" from how the
--                                       spline is stocked; they may sell it by
--                                       the box, the reel or the carton.
--   a line needs saying more            "White, matt finish — as per sample"
--
-- So both become overrides ON THE LINE. Null means "use the component", which
-- is every line that exists today and every one added without a thought, so
-- nothing changes until someone deliberately types over it.
--
-- Deliberately NOT a component edit. Renaming the part from a purchase order
-- would change it on every recipe, every cut sheet and every job that ever
-- used it, to make one supplier's paperwork read better.
-- ============================================================================

alter table purchase_order_lines add column if not exists description text;
alter table purchase_order_lines add column if not exists order_unit  text;


-- ============================================================================
-- VERIFY
-- ============================================================================
-- select id, description, order_unit from purchase_order_lines limit 5;
--   -- expect both null on every existing line

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- alter table purchase_order_lines
--   drop column if exists description,
--   drop column if exists order_unit;
