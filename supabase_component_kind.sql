-- Move the alternatives-group NAME onto the component
--
-- A tube is a tube whoever puts it in a recipe. Naming the group on every
-- recipe line meant typing "Tube" once per line per product — six times for
-- two tubes and two winders across Category A and B — and nothing tied those
-- spellings together. Rename one and the group quietly splits in two.
--
-- So the name moves to the part:
--
--   components.kind                what this part IS — Tube, Winder, Chain,
--                                  Base Rail. Set once, in the component
--                                  library, before it reaches any recipe.
--
--   product_components.group_by_kind
--                                  whether THIS line competes with the other
--                                  lines of its kind in THIS recipe.
--
-- Two fields rather than one, because a shared kind must not be enough on its
-- own to make lines compete. Track Return FF Wave L and Track Return FF Wave R
-- are plainly the same kind of part, and on "Return: Both ends" a track takes
-- BOTH. If the kind alone grouped them, applyGroups would collapse the pair to
-- one line and every both-ends track — on TCO50, TCO51 and two of the legacy
-- segment products — would silently lose a return bracket and be under-costed.
--
-- Only the recipe knows whether two parts of a kind are alternatives or a
-- matched pair, so only the recipe ticks the box. A kind on its own is inert:
-- it names things and groups nothing.
--
-- Precedence, in the engine (see groupKeyOf in bomEngine.js):
--   an explicit product_components.group_key still wins, so anything set by
--   hand keeps working; otherwise a ticked line groups under its kind.

alter table components         add column if not exists kind text;
alter table product_components add column if not exists group_by_kind boolean not null default false;

create index if not exists components_kind_idx on components(kind) where kind is not null;


-- ---------------------------------------------------------- carry over --
-- Every group that exists today was named by hand on the line. The parts in
-- it are, by definition, parts of that kind — so the kind is derivable and
-- nobody has to retype what they already typed.

update components c
   set kind = sub.group_key
  from (select distinct pc.component_id, pc.group_key
          from product_components pc
         where pc.group_key is not null) sub
 where c.id = sub.component_id
   and c.kind is null;
-- Expect: UPDATE 6  — 38mm/43mm Flat Tube (Tube), TBS 38mm/43mm Geared Winder
--                     (Winder), 200cm Plastic Loop Chain (Chain),
--                     TBS Q-Bar Base Rail (Base Rail).

-- Those lines already compete; ticking the box keeps them competing now that
-- the name comes from the part.
update product_components
   set group_by_kind = true
 where group_key is not null;
-- Expect: UPDATE 11

-- Hand the naming over to the kind. Left set, group_key would keep winning and
-- renaming a kind would not reach the recipes that use it — the whole point of
-- the move.
update product_components
   set group_key = null
 where group_key is not null
   and component_id in (select id from components where kind is not null);
-- Expect: UPDATE 11


-- ============================================================================
-- VERIFY — should list the same groups as before, now named by the component
-- ============================================================================
-- select c.kind, p.name as product, c.name as part,
--        pc.group_by_kind, pc.active_min_width, pc.active_max_width
--   from product_components pc
--   join components c on c.id = pc.component_id
--   join products   p on p.id = pc.product_id
--  where pc.group_by_kind
--  order by c.kind, p.name, pc.active_min_width nulls first;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- update product_components pc set group_key = c.kind
--   from components c where pc.component_id = c.id and pc.group_by_kind;
-- alter table product_components drop column if exists group_by_kind;
-- drop index if exists components_kind_idx;
-- alter table components drop column if exists kind;
