-- ============================================================================
-- Phase 1, step 2b of 3 — build the folded TCO51 product
--
-- GENERATED. Do not hand-edit; re-run gen_migration.mjs to regenerate.
-- The generator re-verifies the fold against live data before emitting and
-- refuses to write anything if the recipes have drifted.
--
-- 3 base rows + 22 choice rows = 25 rows on one product,
-- replacing 86 rows across 8 products.
--
-- Requires: supabase_options_schema.sql and supabase_track_options.sql.
-- ============================================================================

begin;

insert into products (name, category, product_type, notes)
select 'TCO51', 'track', 'track',
       'Folded from 8 segment-named TCO51 products. Fixing, opening and return are options.'
where not exists (select 1 from products where name = 'TCO51' and product_type = 'track');


-- ---------------------------------------------------------- base recipe --
-- Always included, whatever the answers.

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), '9a7cb473-d70a-4644-8940-817b60afa7b0', null,
       'width_based', 4, 1,
       500, 75, 0,
       null, null, 0;
-- Series 51

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), '3f90b43c-b7d5-4b97-805f-d0c25d80ab84', null,
       'labour', 0, 0.25,
       500, 75, 0,
       null, null, 6;
-- Labour

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), '19dbe780-5b68-4090-8b42-6a7bf568dc63', null,
       'fixed', 0, 2,
       500, 75, 0,
       null, null, 7;
-- Return Bracket Screw


-- --------------------------------------------------- option: opening --

-- choice "CO" — 4 lines

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), '708ad56c-6789-4a3d-9657-1f75df4a4fc8', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'opening' and c.value = 'CO'),
       'fixed_per_width', 0, 2,
       40, 75, 0,
       'cab44b3d-0049-476d-b0c2-511e662eab46', null, 3;
-- 60mm S-Wave Carrier  [schedule: S-Wave 60mm Sliders — Centre Close (per leaf)]

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), 'c9b99456-fe27-4f61-b58a-10aaa4c69f9a', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'opening' and c.value = 'CO'),
       'fixed', 0, 2,
       500, 75, 0,
       null, null, 5;
-- Wand Carrier

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), 'a898242a-cc53-404c-9b98-787b64cdf70b', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'opening' and c.value = 'CO'),
       'fixed', 0, 2,
       500, 75, 0,
       null, null, 8;
-- Internal Track Stop

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), '134669af-6c4e-45ef-a7a4-015c4254a855', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'opening' and c.value = 'CO'),
       'fixed', 0, 2,
       500, 75, 0,
       null, null, 8;
-- Wand Clear 1.2m

-- choice "FREE" — 5 lines

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), '708ad56c-6789-4a3d-9657-1f75df4a4fc8', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'opening' and c.value = 'FREE'),
       'fixed_per_width', 0, 1,
       40, 75, 0,
       'a8573fc7-b29b-4ea9-b18c-e83612f75644', null, 3;
-- 60mm S-Wave Carrier  [schedule: S-Wave 60mm Sliders — One Way]

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), 'c9b99456-fe27-4f61-b58a-10aaa4c69f9a', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'opening' and c.value = 'FREE'),
       'fixed', 0, 2,
       500, 75, 0,
       null, null, 5;
-- Wand Carrier

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), 'a898242a-cc53-404c-9b98-787b64cdf70b', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'opening' and c.value = 'FREE'),
       'fixed', 0, 2,
       500, 75, 0,
       null, null, 8;
-- Internal Track Stop

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), '134669af-6c4e-45ef-a7a4-015c4254a855', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'opening' and c.value = 'FREE'),
       'fixed', 0, 2,
       500, 75, 0,
       null, null, 8;
-- Wand Clear 1.2m

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), 'efa45afa-8b92-4b7f-8a08-1dad0fc9d27f', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'opening' and c.value = 'FREE'),
       'fixed', 0, 2,
       500, 75, 0,
       null, null, 9;
-- End Plug

-- choice "OW" — 5 lines

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), '708ad56c-6789-4a3d-9657-1f75df4a4fc8', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'opening' and c.value = 'OW'),
       'fixed_per_width', 0, 1,
       40, 75, 0,
       'a8573fc7-b29b-4ea9-b18c-e83612f75644', null, 3;
-- 60mm S-Wave Carrier  [schedule: S-Wave 60mm Sliders — One Way]

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), 'c9b99456-fe27-4f61-b58a-10aaa4c69f9a', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'opening' and c.value = 'OW'),
       'fixed', 0, 1,
       500, 75, 0,
       null, null, 5;
-- Wand Carrier

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), 'a898242a-cc53-404c-9b98-787b64cdf70b', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'opening' and c.value = 'OW'),
       'fixed', 0, 1,
       500, 75, 0,
       null, null, 8;
-- Internal Track Stop

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), '134669af-6c4e-45ef-a7a4-015c4254a855', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'opening' and c.value = 'OW'),
       'fixed', 0, 1,
       500, 75, 0,
       null, null, 8;
-- Wand Clear 1.2m

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), 'efa45afa-8b92-4b7f-8a08-1dad0fc9d27f', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'opening' and c.value = 'OW'),
       'fixed', 0, 1,
       500, 75, 0,
       null, null, 10;
-- End Plug


-- --------------------------------------------------- option: fixing --

-- choice "FACE" — 2 lines

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), '05a51d2d-ee36-47c8-934f-041b04602e06', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'fixing' and c.value = 'FACE'),
       'per_interval', 0, 2,
       1000, 75, 0,
       null, null, 5;
-- Single 75-110mm F/Fix Bracket

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), '7518c6d5-6c70-4855-8eca-3f36a34ace66', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'fixing' and c.value = 'FACE'),
       'per_interval', 0, 2,
       1000, 75, 0,
       null, null, 5;
-- 40mm Foot Cover

-- choice "TOP" — 2 lines

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), 'd49b2aaf-da85-4b8e-882f-6a47012bf026', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'fixing' and c.value = 'TOP'),
       'per_interval', 0, 2,
       500, 75, 0,
       null, null, 7;
-- Ceiling Fix Bracket

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), 'cbd84b9c-2a96-4509-9404-cbc3982014f0', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'fixing' and c.value = 'TOP'),
       'per_interval', 0, 2,
       500, 75, 0,
       null, null, 8;
-- Ceiling Bracket Cover


-- --------------------------------------------------- option: return --

-- choice "both" — 2 lines

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), '71a3b978-e767-4f9d-836c-784ea5eca402', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'return' and c.value = 'both'),
       'fixed', 0, 1,
       500, 75, 0,
       null, null, 9;
-- Track Return FF Wave L

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), '929391ae-38b5-47e9-827c-61f487aec332', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'return' and c.value = 'both'),
       'fixed', 0, 1,
       500, 75, 0,
       null, null, 10;
-- Track Return FF Wave R

-- choice "none" — 0 lines
-- (supplies no components)

-- choice "l" — 1 line

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), '71a3b978-e767-4f9d-836c-784ea5eca402', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'return' and c.value = 'l'),
       'fixed', 0, 1,
       500, 75, 0,
       null, null, 9;
-- Track Return FF Wave L

-- choice "r" — 1 line

insert into product_components
  (product_id, component_id, option_choice_id, cost_type, formula_deduction, formula_buffer,
   formula_interval, formula_divisor, discount, width_schedule_id, colour_variant, sort_order)
select (select id from products where name = 'TCO51' and product_type = 'track'), '929391ae-38b5-47e9-827c-61f487aec332', (select c.id from product_option_choices c join product_options o on o.id = c.option_id
              where o.product_type = 'track' and o.code = 'return' and c.value = 'r'),
       'fixed', 0, 1,
       500, 75, 0,
       null, null, 9;
-- Track Return FF Wave R


commit;

-- Verify: expect 25 rows.
-- select count(*) from product_components where product_id = (select id from products where name = 'TCO51' and product_type = 'track');


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- delete from product_components where product_id = (select id from products where name = 'TCO51' and product_type = 'track');
-- delete from products where name = 'TCO51' and product_type = 'track';
