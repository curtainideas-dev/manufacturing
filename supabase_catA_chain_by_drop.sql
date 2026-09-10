-- Category A: pick the chain from the blind's finished drop
--
-- Every Category A blind currently gets a 2000mm chain, whatever its drop —
-- one unbanded recipe line. The real rule is a table of nine sizes:
--
--     500mm chain      200 –  800mm drop
--     750mm            801 – 1200
--    1000mm           1201 – 1500
--    1250mm           1501 – 1700
--    1500mm           1701 – 2200
--    1750mm           2201 – 2700
--    2000mm           2701 – 3000
--    2500mm           3001 – 3500
--    3000mm           3501 – 5000
--
-- That is nine recipe lines, one per chain, each limited to its drop band and
-- all in the Chain alternatives group, so resolveRecipe filters by band first
-- and the group is left holding exactly one line. Same shape as the tube pair
-- on this product, which switches on width — no new engine behaviour.
--
-- THE ENDS ARE DELIBERATELY OPEN. The first band has no minimum and the last
-- no maximum, rather than stopping at the table's 200mm and 5000mm. A drop
-- outside a band matches no line at all, and the group cannot invent one, so a
-- 150mm blind would reach the factory with NO CHAIN on its BOM — silently, and
-- looking exactly like a blind that needs none. The biggest or smallest chain
-- is a visible wrong answer; no chain is an invisible one. Tighten it if you
-- would rather those sizes fail loudly.

begin;


-- ------------------------------------------------- 1. the missing chains --
-- The table names three sizes the library does not hold. Prices are ESTIMATES
-- read off the existing size/price curve, which is close to linear at about
-- $0.0127 per cm over a $0.65 base:
--
--     60cm $1.41 · 75cm $1.66 · 100cm $1.98 · 125cm $2.20
--    150cm $2.51 · 175cm $2.78 · 200cm $3.19
--
-- CHECK THESE AGAINST THE SUPPLIER before quoting on them. The part numbers
-- follow the B0-RB006-<cm> pattern and are guesses for the same reason.
-- Everything else — supplier, 50% discount, pack of 1, sold each — matches
-- its siblings exactly.

insert into components (name, kind, order_type, unit, unit_cost, pack_price, pack_qty, discount, supplier_id, supplier_pn, colour_variants)
select v.name, 'Chain', 'pack', 'each', v.price, v.price, 1, 50,
       (select supplier_id from components where name = '200cm Plastic Loop Chain'),
       v.pn, '[]'::jsonb
  from (values
    ('50cm Plastic Loop Chain',  1.28, 'B0-RB006-50'),
    ('250cm Plastic Loop Chain', 3.83, 'B0-RB006-250'),
    ('300cm Plastic Loop Chain', 4.46, 'B0-RB006-300')
  ) as v(name, price, pn)
 where not exists (select 1 from components c where c.name = v.name);
-- Expect: INSERT 0 3


-- --------------------------------------------- 2. the drop-banded recipe --
-- Out with the single unbanded line, in with the nine.

delete from product_components pc
 using products p, components c
 where pc.product_id = p.id
   and pc.component_id = c.id
   and p.name = 'Category A'
   and c.kind = 'Chain';
-- Expect: DELETE 1

insert into product_components
  (product_id, component_id, cost_type, formula_buffer, formula_deduction,
   formula_divisor, formula_interval, discount,
   active_min_drop, active_max_drop, group_by_kind, sort_order)
select (select id from products where name = 'Category A'),
       (select id from components where name = v.chain),
       'fixed', 1, 0, 75, 500, 0,
       v.min_drop, v.max_drop, true, 2
  from (values
    ('50cm Plastic Loop Chain',  null::numeric, 800::numeric),
    ('75cm Plastic Loop Chain',   801,  1200),
    ('100cm Plastic Loop Chain', 1201,  1500),
    ('125cm Plastic Loop Chain', 1501,  1700),
    ('150cm Plastic Loop Chain', 1701,  2200),
    ('175cm Plastic Loop Chain', 2201,  2700),
    ('200cm Plastic Loop Chain', 2701,  3000),
    ('250cm Plastic Loop Chain', 3001,  3500),
    ('300cm Plastic Loop Chain', 3501,  null)
  ) as v(chain, min_drop, max_drop);
-- Expect: INSERT 0 9
-- Note the 60cm chain is not in the table and so is not used here. It keeps
-- its Chain kind, so it stays available as a hand-picked alternative.

commit;


-- ============================================================================
-- SEPARATE FIX — run this one only if you agree with it
--
-- 150cm Plastic Loop Chain is priced at $0.40 each, where its neighbours run
-- $2.20 and $2.78. The cause is visible in the row: pack_price = 1 and
-- pack_qty = 2.51, which is the two fields swapped. Read the right way round
-- it is $2.51 — and $2.51 is almost exactly where the size/price curve puts a
-- 150cm chain, which is what makes this a slip rather than a real price.
--
-- Left alone, every Category A blind in the 1701–2200mm band — the widest band
-- in the table — is costed at about a sixth of what its chain really costs.
-- It is kept out of the transaction above because changing a price is your
-- call, not a side effect of adding a rule.
-- ============================================================================
-- update components
--    set pack_price = 2.51, pack_qty = 1, unit_cost = 2.51
--  where name = '150cm Plastic Loop Chain';


-- ============================================================================
-- VERIFY — the ladder, in order
-- ============================================================================
-- select c.name, pc.active_min_drop as from_mm, pc.active_max_drop as to_mm,
--        c.unit_cost, pc.group_by_kind
--   from product_components pc
--   join components c on c.id = pc.component_id
--   join products   p on p.id = pc.product_id
--  where p.name = 'Category A' and c.kind = 'Chain'
--  order by pc.active_min_drop nulls first;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- delete from product_components pc using products p, components c
--  where pc.product_id = p.id and pc.component_id = c.id
--    and p.name = 'Category A' and c.kind = 'Chain';
-- insert into product_components
--   (product_id, component_id, cost_type, formula_buffer, formula_deduction,
--    formula_divisor, formula_interval, discount, group_by_kind, sort_order)
-- select (select id from products where name = 'Category A'),
--        (select id from components where name = '200cm Plastic Loop Chain'),
--        'fixed', 1, 0, 75, 500, 0, true, 2;
-- delete from components where name in
--   ('50cm Plastic Loop Chain','250cm Plastic Loop Chain','300cm Plastic Loop Chain');
