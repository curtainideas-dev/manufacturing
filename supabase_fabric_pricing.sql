-- ============================================================================
-- Fabric pricing categories
--
-- A blind is quoted at a flat rate per pricing category (A-F), not at
-- whatever the specific fabric actually costs — two different Category B
-- fabrics price identically on a job even if their wholesale rates differ.
-- Real fabric cost still drives roll-cutting, stock and PO math elsewhere;
-- this rate only feeds the window BOM / cost sheet.
--
-- A fabric's category is never stored — it's computed live from its real
-- unit_cost against these six thresholds (the first category, by ascending
-- price, whose max_price covers it — same lookup pattern as a width
-- schedule). That keeps it correct automatically if a threshold changes,
-- with nothing to go stale.
--
-- The six letters are fixed, so this is exactly six rows, not open CRUD.
-- ============================================================================

create table if not exists fabric_categories (
  code       text primary key check (code in ('A','B','C','D','E','F')),
  max_price  numeric not null default 0,
  created_at timestamptz not null default now()
);

insert into fabric_categories (code, max_price) values
  ('A', 0), ('B', 0), ('C', 0), ('D', 0), ('E', 0), ('F', 0)
on conflict (code) do nothing;

-- A blind product is locked to exactly one category — its recipe holds the
-- hardware lines, and the window-add fabric dropdown offers whatever fabric
-- is currently classified into that category.
do $$ begin
  alter table products add constraint products_fabric_category_check
    check (fabric_category is null or fabric_category in ('A','B','C','D','E','F'));
exception when duplicate_object then null; end $$;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- alter table products drop constraint if exists products_fabric_category_check;
-- drop table if exists fabric_categories;
