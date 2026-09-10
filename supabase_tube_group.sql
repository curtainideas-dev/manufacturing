-- Put the 43mm tube in the same alternatives group as the 38mm one
--
-- Category A and Category B each build their tube from two recipe lines:
--
--   38mm Flat Tube   width 0–2199     group_key 'Tube'
--   43mm Flat Tube   width 2200–∞     group_key NULL
--
-- They are plainly alternatives — one tube or the other, decided by width —
-- but only the first was ever tagged, so the group has a single member and
-- does nothing. The right answer still comes out, because the two bands
-- happen to be complementary: below 2200 the 43mm line is banded out, above
-- it the 38mm line is, and exactly one survives either way.
--
-- That is luck, not structure. resolveRecipe applies bands BEFORE grouping,
-- so an ungrouped pair is only ever as correct as its bands:
--
--   overlapping bands  -> BOTH tubes land on the BOM, silently, and the blind
--                         is costed and picked with two tubes.
--   a gap between them -> no tube at all.
--
-- Inside one group neither is possible. applyGroups collapses the group to
-- exactly one line, so an overlap resolves instead of doubling. (A gap still
-- yields nothing — no rule can invent a line that isn't there — but a gap is
-- visible in the grouped recipe view, where an overlap never was.)
--
-- No BOM changes as a result of this. It makes the existing behaviour
-- structural rather than incidental, and puts the two tubes on one row in the
-- recipe list instead of twelve rows apart.

update product_components pc
   set group_key = 'Tube'
  from components c, products p
 where pc.component_id = c.id
   and pc.product_id   = p.id
   and c.name          = '43mm Flat Tube'
   and p.name         in ('Category A', 'Category B')
   and pc.group_key is null;

-- Expect: UPDATE 2. Verify both tubes now share the group:
--
--   select p.name, pc.group_key, c.name, pc.active_min_width, pc.active_max_width
--     from product_components pc
--     join components c on c.id = pc.component_id
--     join products   p on p.id = pc.product_id
--    where pc.group_key = 'Tube' order by p.name, pc.active_min_width nulls first;

-- Rollback
-- update product_components pc set group_key = null
--   from components c where pc.component_id = c.id and c.name = '43mm Flat Tube';
