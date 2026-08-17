-- ============================================================================
-- Drop limits per width
--
-- Some parts are needed once a blind gets tall for its width, and the
-- threshold moves with the width in a way no formula describes:
--
--     up to 2000 wide  ->  add-on once the drop passes 1800
--     up to 2100 wide  ->  add-on once the drop passes 1600
--     up to 2200 wide  ->  add-on once the drop passes 1800
--
-- The 2100 threshold is lower than both its neighbours. Nothing built out of
-- width and drop produces that, so this is stored as a lookup table and read
-- the same way a width schedule is: the first band the width fits into, with
-- anything wider than the last band using the last band's figure.
--
-- Additive and nullable, so existing recipes are unaffected.
-- ============================================================================

-- { "<width up to mm>": <drop threshold mm> }
--   e.g. {"2000": 1800, "2100": 1600, "2200": 1800}
alter table product_components add column if not exists drop_limit jsonb;

-- Which side of the threshold the line applies on.
--   above        the add-on, needed once the drop passes the limit
--   at_or_below  the standard part the add-on replaces
-- Pair the two on one group_key and exactly one of them survives.
alter table product_components add column if not exists drop_limit_mode text
  not null default 'above';

do $$ begin
  alter table product_components add constraint product_components_drop_limit_mode_check
    check (drop_limit_mode in ('above','at_or_below'));
exception when duplicate_object then null; end $$;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- alter table product_components
--   drop constraint if exists product_components_drop_limit_mode_check,
--   drop column if exists drop_limit,
--   drop column if exists drop_limit_mode;
