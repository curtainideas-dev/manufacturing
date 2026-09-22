-- ============================================================================
-- Sell prices and gross profit
--
-- The app knew what everything COST and nothing about what anything EARNED.
-- The only figure beside cost was cost × a markup, which is an assumption
-- wearing a price tag. This is the other half.
--
-- It also retires the original meaning of a fabric category. Categories were
-- invented here to price fabric on the COST side: a flat rate per tier, with a
-- fabric's tier derived from its real cost against six ceilings. That is how a
-- retailer prices — quick to quote, every Category B fabric interchangeable at
-- the counter — and it is not what this app is for. We buy from a wholesaler's
-- price list and use this app to find our true cost, so cost now comes from
-- the fabric's own wholesale rate and nothing else.
--
-- The categories survive because the WHOLESALER's list is organised by them.
-- They move from being a cost rate we derive to being a sell key we are told:
-- each one carries the list's width × drop price grid, and each fabric is
-- tagged with the category it is sold under. Nothing derives a category any
-- more, because nothing can — only the supplier's list knows.
-- ============================================================================


-- ------------------------------------------------------- fabric_categories --
-- Was exactly six rows, A-F, enforced by a CHECK. The real list has eleven
-- roller tiers: Budget and A-F for blockout and light filter, then G-J for
-- sunscreen. Fixed letters cannot hold that, and the next list will not ask
-- permission before adding a tier, so the check goes and the table becomes an
-- ordinary editable list.
do $$ begin
  alter table fabric_categories drop constraint if exists fabric_categories_code_check;
exception when undefined_object then null; end $$;

alter table fabric_categories add column if not exists name       text;
alter table fabric_categories add column if not exists sort_order integer not null default 0;

-- The price grid, straight off the supplier's sheet:
--   widths  [1000, 1200, ... 3000]        the columns, ascending
--   drops   [1000, 1200, ... 3000]        the rows, ascending
--   prices  [[67, 72, ...], [70, 76, ...]]  one array per drop, in width order
--
-- A null cell means "not offered at that size" and stays null. Zero would mean
-- free, and a blind priced at zero reports 100% margin.
alter table fabric_categories add column if not exists widths jsonb;
alter table fabric_categories add column if not exists drops  jsonb;
alter table fabric_categories add column if not exists prices jsonb;

-- Where the grid came from, so a figure can be traced back to a sheet in a
-- workbook. The list has tabs eleven years apart sitting next to each other,
-- which is exactly how the wrong one gets loaded without anyone noticing.
alter table fabric_categories add column if not exists price_list_label text;
alter table fabric_categories add column if not exists price_list_year  integer;
alter table fabric_categories add column if not exists priced_at        timestamptz;

-- Seed the tiers the current list actually has. Existing A-F rows keep their
-- ids and gain a name; Budget is new.
insert into fabric_categories (code, max_price) values ('Budget', 0)
on conflict (code) do nothing;

update fabric_categories set
  name = coalesce(name, case when code = 'Budget' then 'Budget' else 'Category ' || code end),
  sort_order = case code
    when 'Budget' then 0 when 'A' then 1 when 'B' then 2 when 'C' then 3
    when 'D' then 4 when 'E' then 5 when 'F' then 6 else 99 end
where sort_order = 0;

-- NOTE, not a change: fabric_categories.max_price is the old cost-side rate.
-- Nothing reads it any more. It is left in place rather than dropped, matching
-- how product_components.formula_divisor was handled — removing a column is a
-- separate, destructive step once you are satisfied nothing wants it back.


-- -------------------------------------------------------------- components --
-- components.fabric_category already exists. What changes is that it is now
-- WRITTEN rather than derived: a fabric is tagged with the tier the supplier
-- sells it under, by hand, in the component library. Nothing computes it.
create index if not exists components_fabric_category_sell_idx
  on components(fabric_category) where order_type = 'fabric';


-- ---------------------------------------------------------------- products --
-- products.fabric_category used to lock a blind product to one tier, so the
-- customise modal could offer that tier's fabrics. Every fabric is offered
-- now, since any fabric goes on any roller blind and both cost and sell follow
-- the fabric rather than the product. The column is left alone but no longer
-- read — same reasoning as max_price above.


-- ----------------------------------------------------------------- windows --
-- What we ACTUALLY charged, when that differs from the list. Null means "use
-- the list", which is the normal case; a number here is a discount, a price
-- held from an old quote, or a track, which has no fabric and therefore no
-- category and no grid to look anything up in.
alter table mfg_windows add column if not exists sell_price numeric;


-- -------------------------------------------------------------------- jobs --
-- Sell freezes at confirm beside cost.
--
-- price_snapshot already stops a confirmed job's COST moving when component
-- pricing changes. Sell needs the same protection for the same reason: without
-- it, loading next year's price list would silently rewrite the margin on
-- every job ever completed, and a GP report that changes when you restate the
-- prices is not a report.
--
-- Shape mirrors qty_snapshot — { "<window uuid>": 214.00 }.
alter table mfg_jobs add column if not exists sell_snapshot jsonb;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- alter table mfg_jobs    drop column if exists sell_snapshot;
-- alter table mfg_windows drop column if exists sell_price;
-- drop index if exists components_fabric_category_sell_idx;
-- alter table fabric_categories
--   drop column if exists widths, drop column if exists drops,
--   drop column if exists prices, drop column if exists price_list_label,
--   drop column if exists price_list_year, drop column if exists priced_at,
--   drop column if exists name, drop column if exists sort_order;
-- delete from fabric_categories where code = 'Budget';
-- alter table fabric_categories add constraint fabric_categories_code_check
--   check (code in ('A','B','C','D','E','F'));
