-- A managed vocabulary of component kinds
--
-- components.kind started as free text, which was right for finding out what
-- the kinds were and wrong for living with: "Base Rail", "Base rail" and
-- "Baserail" are three groups that look like one, and nothing lists what
-- already exists before you type. So the names move into a table you curate,
-- and the field becomes a pick from that list.
--
-- Deliberately NOT a foreign key. components.kind stays text holding the
-- kind's NAME, because that is what the engine already groups by — see
-- groupKeyOf, which reads component.kind straight into an alternatives group
-- name. Making it an id would mean a join on every recipe resolution to
-- recover a string the row could have carried itself, for no gain. The
-- vocabulary table constrains what gets typed; it is not the source of truth
-- for what a part is.
--
-- The cost of that choice is that a rename has to be carried across, which is
-- one UPDATE and is exactly what the admin screen's rename does.
--
--   name                the kind, as shown and as stored on components.kind.
--   default_order_type  how parts of this kind are usually bought. Picking a
--                       kind on a component pre-selects this, which is the
--                       whole reason the column exists — every Winder is a
--                       pack, every Tube is a bar, and answering that twice
--                       was the friction. It is a DEFAULT, never a rule:
--                       order_type stays the component's own, because it
--                       drives stock, POs and the cut sheet, and a supplier
--                       who sells base rail cut to length rather than in packs
--                       must not need a new kind to say so.
--   sort_order          the order the list is shown in.

create table if not exists component_kinds (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null unique,
  default_order_type text check (default_order_type in ('pack','bar','labour','fabric')),
  sort_order         integer not null default 0,
  created_at         timestamptz default now()
);

-- Seed from what is already in use, so nothing has to be re-entered and no
-- existing component is orphaned from the vocabulary the moment it exists.
-- default_order_type is taken from the parts themselves, and only where they
-- agree — a kind spanning two order types has no obvious default and is left
-- blank rather than guessed.
insert into component_kinds (name, default_order_type, sort_order)
select c.kind,
       case when count(distinct c.order_type) = 1 then min(c.order_type) end,
       row_number() over (order by c.kind) * 10
  from components c
 where c.kind is not null and c.kind <> ''
 group by c.kind
on conflict (name) do nothing;

-- Expect one row per distinct kind currently in use — at the time of writing
-- Base Rail (pack), Chain (pack), Tube (bar), Winder (pack).


-- ============================================================================
-- VERIFY
-- ============================================================================
-- select k.name, k.default_order_type, k.sort_order,
--        (select count(*) from components c where c.kind = k.name) as parts
--   from component_kinds k order by k.sort_order;
--
-- Any component whose kind is not in the vocabulary (should return no rows):
-- select name, kind from components
--  where kind is not null and kind not in (select name from component_kinds);

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- drop table if exists component_kinds;
