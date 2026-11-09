-- ============================================================================
-- NOT YET APPLIED — the executable copy is
-- supabase/migrations/20260924021500_po_delivery_pickup.sql. Run that with
-- `supabase db push`, or paste this file into the SQL editor. This file is the
-- annotated record of WHY; that one is the statement. Change both or neither.
--
-- Purchase orders: delivery or pickup, and more than one place to deliver to
--
-- Two gaps, and they are the same gap seen from either end.
--
-- Every order this app has produced assumed the goods were being DELIVERED,
-- to the one address typed into Company Details. Neither half held up:
--
--   * Some orders are collected. Printing a delivery address on an order
--     someone is going to drive over and pick up is how a pallet ends up on a
--     truck that nobody was waiting for.
--   * There is more than one place goods land — the workroom, the warehouse,
--     occasionally straight to a site. One free-text field meant editing the
--     company record before each order and remembering to put it back, which
--     nobody does, so the wrong address goes out.
-- ============================================================================


-- ---------------------------------------------------- the places we receive --
-- A table rather than more columns on company_details, because "how many
-- addresses" is a question that keeps changing and columns do not.
--
-- `label` is what the dropdown on the order shows — "Workshop", "Warehouse".
-- `address` prints as typed, line breaks kept, same as the postal address.
-- `note` is the standing instruction for THAT place ("rear roller door,
-- 7am-3pm"), which is exactly why it could not live on the company record:
-- the instruction belongs to the door, not to the business.
create table if not exists company_addresses (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  address    text not null,
  note       text,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- One default, enforced here rather than hoped for in the client. A partial
-- unique index allows any number of false rows and exactly one true.
create unique index if not exists company_addresses_one_default_idx
  on company_addresses (is_default) where is_default;

-- The address already in use becomes the first row, marked default, so the
-- next PDF prints exactly what the last one did. Skipped entirely if someone
-- has already added addresses by hand.
insert into company_addresses (label, address, note, is_default)
select 'Workshop',
       coalesce(nullif(btrim(c.delivery_address), ''), c.address),
       nullif(btrim(c.delivery_note), ''),
       true
  from company_details c
 where c.id = 1
   and coalesce(nullif(btrim(c.delivery_address), ''), nullif(btrim(c.address), '')) is not null
   and not exists (select 1 from company_addresses);

-- company_details.delivery_address / delivery_note are deliberately LEFT IN
-- PLACE and left populated. They are no longer edited anywhere — the admin
-- screen now manages the list — but they remain the fallback the PDF uses
-- when no addresses exist at all, which is the state of any database where
-- this migration has not run. Dropping them would make the old code path fail
-- instead of degrade.


-- ------------------------------------------------ how this order gets here --
-- On the ORDER, for the same reason hide_pricing is: the sheet someone opens
-- next month has to be the sheet that was sent. A screen toggle would let the
-- PDF and the screen disagree about something a supplier acted on.
--
-- Defaulting to 'delivery' keeps every order that already exists reading the
-- way it was sent.
alter table purchase_orders
  add column if not exists fulfilment text not null default 'delivery';

-- Null means "whichever address is default". That is what every existing
-- order gets, and what a new draft starts as — so a shop with one address
-- never has to think about this column.
--
-- It is pinned to a real id when the order is marked sent, so changing the
-- default address later cannot rewrite the address a supplier was already
-- given. on delete set null: removing an address returns those orders to the
-- default rather than refusing the delete.
alter table purchase_orders
  add column if not exists delivery_address_id uuid
  references company_addresses(id) on delete set null;

-- status has no check constraint on this table (a deliberate earlier call —
-- the lifecycle was still moving). This one does, because there are exactly
-- two ways goods travel and a typo here prints the wrong instruction on a
-- document that leaves the building.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_orders_fulfilment_chk') then
    alter table purchase_orders
      add constraint purchase_orders_fulfilment_chk check (fulfilment in ('delivery', 'pickup'));
  end if;
end $$;


-- ============================================================================
-- VERIFY
-- ============================================================================
-- select label, is_default, address from company_addresses order by sort_order;
--   -- expect one row, default, holding whatever Company Details used to say
--
-- select fulfilment, count(*), count(delivery_address_id) as pinned
--   from purchase_orders group by fulfilment;
--   -- expect every existing order 'delivery' with nothing pinned


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- alter table purchase_orders drop constraint if exists purchase_orders_fulfilment_chk;
-- alter table purchase_orders drop column if exists delivery_address_id;
-- alter table purchase_orders drop column if exists fulfilment;
-- drop table if exists company_addresses;
