-- ============================================================================
-- Phase 1, step 3 of 3 — cutover
--
-- GENERATED. Re-points the 36 historical windows at the folded product and
-- records the answers their old product name encoded, then archives the 8
-- superseded products.
--
-- Safe because the fold is verified lossless: every one of these windows
-- recomputes an identical bill of materials from the new product. Confirmed
-- jobs read frozen price_snapshot/qty_snapshot regardless, and no window in
-- the database carries a bom_override.
--
-- Products are archived, never deleted, so nothing can orphan.
-- ============================================================================

begin;

-- TCO51 | FACE | CO | HD  (19 windows)
update mfg_windows
   set product_id = (select id from products where name = 'TCO51' and product_type = 'track'),
       config     = '{"options":{"fixing":"FACE","opening":"CO","return":"both","operation":"HD"}}'::jsonb
 where product_id = 'e0c090e4-f348-40bd-b57a-c6d5c206be39';

-- TCO51 | FACE | FREE | HD  (3 windows)
update mfg_windows
   set product_id = (select id from products where name = 'TCO51' and product_type = 'track'),
       config     = '{"options":{"fixing":"FACE","opening":"FREE","return":"none","operation":"HD"}}'::jsonb
 where product_id = '147ab301-2022-4efd-a2c1-0279200a83a1';

-- TCO51 | FACE | OW | HD | LR  (2 windows)
update mfg_windows
   set product_id = (select id from products where name = 'TCO51' and product_type = 'track'),
       config     = '{"options":{"fixing":"FACE","opening":"OW","return":"l","operation":"HD"}}'::jsonb
 where product_id = 'b9fb18b1-7f75-4d48-8973-aa6ffb883f58';

-- TCO51 | FACE | OW | HD | RR  (3 windows)
update mfg_windows
   set product_id = (select id from products where name = 'TCO51' and product_type = 'track'),
       config     = '{"options":{"fixing":"FACE","opening":"OW","return":"r","operation":"HD"}}'::jsonb
 where product_id = '9bdcc2f4-0cb0-407e-afb0-19177cd7e526';

-- TCO51 | TOP | CO | HD  (6 windows)
update mfg_windows
   set product_id = (select id from products where name = 'TCO51' and product_type = 'track'),
       config     = '{"options":{"fixing":"TOP","opening":"CO","return":"both","operation":"HD"}}'::jsonb
 where product_id = 'c7e59fcc-160b-41c8-971d-e2796b4976f8';

-- TCO51 | TOP | FREE | HD  (0 windows)
update mfg_windows
   set product_id = (select id from products where name = 'TCO51' and product_type = 'track'),
       config     = '{"options":{"fixing":"TOP","opening":"FREE","return":"none","operation":"HD"}}'::jsonb
 where product_id = 'f72b4f3a-2999-48a8-879f-f244bcd46340';

-- TCO51 | TOP | OW | HD | LR  (0 windows)
update mfg_windows
   set product_id = (select id from products where name = 'TCO51' and product_type = 'track'),
       config     = '{"options":{"fixing":"TOP","opening":"OW","return":"l","operation":"HD"}}'::jsonb
 where product_id = '9b5a8d09-3b23-4627-8994-3aad4209ab38';

-- TCO51 | TOP | OW | HD | RR  (3 windows)
update mfg_windows
   set product_id = (select id from products where name = 'TCO51' and product_type = 'track'),
       config     = '{"options":{"fixing":"TOP","opening":"OW","return":"r","operation":"HD"}}'::jsonb
 where product_id = '20b2b590-af4a-4e16-8ac4-9c98dc92d972';


-- The 8 superseded products leave the picker but stay resolvable.
update products set archived = true
 where id in ('e0c090e4-f348-40bd-b57a-c6d5c206be39',
              '147ab301-2022-4efd-a2c1-0279200a83a1',
              'b9fb18b1-7f75-4d48-8973-aa6ffb883f58',
              '9bdcc2f4-0cb0-407e-afb0-19177cd7e526',
              'c7e59fcc-160b-41c8-971d-e2796b4976f8',
              'f72b4f3a-2999-48a8-879f-f244bcd46340',
              '9b5a8d09-3b23-4627-8994-3aad4209ab38',
              '20b2b590-af4a-4e16-8ac4-9c98dc92d972');

commit;

-- Verify: expect 0 rows.
-- select p.name, count(*) from mfg_windows w join products p on p.id = w.product_id
--  where p.archived group by p.name;


-- ============================================================================
-- ROLLBACK — restores every window to the product it came from
-- ============================================================================
-- begin;
-- update mfg_windows set product_id = 'e0c090e4-f348-40bd-b57a-c6d5c206be39', config = '{}'::jsonb
--  where product_id = (select id from products where name = 'TCO51' and product_type = 'track') and config->'options'->>'fixing' = 'FACE'
--    and config->'options'->>'opening' = 'CO' and config->'options'->>'return' = 'both';
-- update mfg_windows set product_id = '147ab301-2022-4efd-a2c1-0279200a83a1', config = '{}'::jsonb
--  where product_id = (select id from products where name = 'TCO51' and product_type = 'track') and config->'options'->>'fixing' = 'FACE'
--    and config->'options'->>'opening' = 'FREE' and config->'options'->>'return' = 'none';
-- update mfg_windows set product_id = 'b9fb18b1-7f75-4d48-8973-aa6ffb883f58', config = '{}'::jsonb
--  where product_id = (select id from products where name = 'TCO51' and product_type = 'track') and config->'options'->>'fixing' = 'FACE'
--    and config->'options'->>'opening' = 'OW' and config->'options'->>'return' = 'l';
-- update mfg_windows set product_id = '9bdcc2f4-0cb0-407e-afb0-19177cd7e526', config = '{}'::jsonb
--  where product_id = (select id from products where name = 'TCO51' and product_type = 'track') and config->'options'->>'fixing' = 'FACE'
--    and config->'options'->>'opening' = 'OW' and config->'options'->>'return' = 'r';
-- update mfg_windows set product_id = 'c7e59fcc-160b-41c8-971d-e2796b4976f8', config = '{}'::jsonb
--  where product_id = (select id from products where name = 'TCO51' and product_type = 'track') and config->'options'->>'fixing' = 'TOP'
--    and config->'options'->>'opening' = 'CO' and config->'options'->>'return' = 'both';
-- update mfg_windows set product_id = 'f72b4f3a-2999-48a8-879f-f244bcd46340', config = '{}'::jsonb
--  where product_id = (select id from products where name = 'TCO51' and product_type = 'track') and config->'options'->>'fixing' = 'TOP'
--    and config->'options'->>'opening' = 'FREE' and config->'options'->>'return' = 'none';
-- update mfg_windows set product_id = '9b5a8d09-3b23-4627-8994-3aad4209ab38', config = '{}'::jsonb
--  where product_id = (select id from products where name = 'TCO51' and product_type = 'track') and config->'options'->>'fixing' = 'TOP'
--    and config->'options'->>'opening' = 'OW' and config->'options'->>'return' = 'l';
-- update mfg_windows set product_id = '20b2b590-af4a-4e16-8ac4-9c98dc92d972', config = '{}'::jsonb
--  where product_id = (select id from products where name = 'TCO51' and product_type = 'track') and config->'options'->>'fixing' = 'TOP'
--    and config->'options'->>'opening' = 'OW' and config->'options'->>'return' = 'r';
-- update products set archived = false where id in ('e0c090e4-f348-40bd-b57a-c6d5c206be39', '147ab301-2022-4efd-a2c1-0279200a83a1', 'b9fb18b1-7f75-4d48-8973-aa6ffb883f58', '9bdcc2f4-0cb0-407e-afb0-19177cd7e526', 'c7e59fcc-160b-41c8-971d-e2796b4976f8', 'f72b4f3a-2999-48a8-879f-f244bcd46340', '9b5a8d09-3b23-4627-8994-3aad4209ab38', '20b2b590-af4a-4e16-8ac4-9c98dc92d972');
-- commit;
