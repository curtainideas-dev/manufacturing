-- ============================================================================
-- Fabrics
--
-- Three levels, mapped onto what already exists rather than a parallel world:
--
--   SHAW   the maker    -> suppliers.id               (already there)
--   VIBE   the fabric   -> one components row
--   ICE    the colour   -> components.colour_variants (already there)
--
-- Fabric is priced per m², one figure per fabric whatever width the roll is.
-- That is why VIBE is a single row: there is nothing about a 2.1m roll that
-- needs its own price. Roll width belongs to the physical roll instead — the
-- same fabric can arrive 2.1m wide one month and 3m wide the next.
--
-- Because the rate is flat, what a cut costs is roll width × length consumed,
-- so cheapest and least-waste are the same question and it is answered by
-- geometry alone. No per-width price list to maintain or drift.
--
-- Rolls in stock reuse stock_bars: a roll is a stocked linear item with a
-- remaining length, which is what a bar already is. Reusing it means
-- receiving, cutting, offcuts and best-fit selection work as they do today.
-- ============================================================================

-- 'fabric' joins pack / bar / labour.
do $$ begin
  alter table components drop constraint if exists components_order_type_check;
  alter table components add constraint components_order_type_check
    check (order_type in ('pack','bar','labour','fabric'));
exception when undefined_object then null; end $$;

-- Short code for the fabric — VIBE. The row's name stays human-readable.
alter table components add column if not exists fabric_code text;

-- Widths this fabric can be ordered in, e.g. [2100, 3000]. Used when nothing
-- suitable is in stock and a roll has to be bought; the width chosen is the
-- one that would waste least for that blind.
alter table components add column if not exists roll_widths jsonb;

-- components.fabric_category already exists and ties the fabric to the blind
-- product that offers it.

create index if not exists components_fabric_code_idx
  on components(fabric_code) where fabric_code is not null;
create index if not exists components_fabric_category_idx
  on components(fabric_category) where fabric_category is not null;


-- ---------------------------------------------------------- rolls in stock --
-- Each physical roll carries its own width. Length is entered on receipt,
-- because rolls arrive at whatever length the supplier sent, and length_mm
-- already means "how much of this piece is left".
alter table stock_bars add column if not exists roll_width_mm numeric;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- alter table stock_bars drop column if exists roll_width_mm;
-- drop index if exists components_fabric_category_idx;
-- drop index if exists components_fabric_code_idx;
-- alter table components
--   drop column if exists fabric_code,
--   drop column if exists roll_widths;
-- alter table components drop constraint if exists components_order_type_check;
-- alter table components add constraint components_order_type_check
--   check (order_type in ('pack','bar','labour'));
