-- ============================================================================
-- Phase 1, step 2a of 3 — track option definitions
--
-- Derived from diffing the 8 existing TCO51 products, not invented. Each
-- option below is a dimension along which those products actually differed.
--
-- Safe to run before step 2b. On its own it creates questions that nothing
-- answers yet, so the app is unchanged until the recipe rows are attached.
--
-- Re-runnable: every insert is keyed on (product_type, code) or
-- (option_id, value) and does nothing if the row already exists.
-- ============================================================================

-- ------------------------------------------------------------------ Fixing --
-- FACE -> face-fix bracket + 40mm foot cover, 2 + 1 per 1000mm width
-- TOP  -> ceiling bracket + ceiling cover,    2 + 1 per 500mm width
insert into product_options (product_type, code, name, selection, required, sort_order)
values ('track', 'fixing', 'Fixing', 'single', true, 1)
on conflict (product_type, code) do nothing;

insert into product_option_choices (option_id, value, label, sort_order, is_default)
select o.id, v.value, v.label, v.sort_order, v.is_default
  from product_options o,
       (values ('FACE', 'Face fix', 1, true),
               ('TOP',  'Top fix',  2, false)) as v(value, label, sort_order, is_default)
 where o.product_type = 'track' and o.code = 'fixing'
on conflict (option_id, value) do nothing;


-- ----------------------------------------------------------------- Opening --
-- Drives the carrier schedule and multiplier, the wand/stop/wand quantities,
-- and the end plug. Also decides the return (see below).
insert into product_options (product_type, code, name, selection, required, sort_order)
values ('track', 'opening', 'Opening', 'single', true, 2)
on conflict (product_type, code) do nothing;

insert into product_option_choices (option_id, value, label, sort_order, is_default)
select o.id, v.value, v.label, v.sort_order, v.is_default
  from product_options o,
       (values ('CO',   'Centre open',  1, false),
               ('FREE', 'Free hanging', 2, false),
               ('OW',   'One way',      3, false)) as v(value, label, sort_order, is_default)
 where o.product_type = 'track' and o.code = 'opening'
on conflict (option_id, value) do nothing;


-- ------------------------------------------------------------------ Return --
-- The rule the recipes forced out: centre open returns at both ends, free
-- hanging has no return, one way takes the bracket matching its side. So the
-- answer has four values and the opening decides three of them — only One way
-- is ever asked, and a hidden-but-forced answer is never counted as missing.
insert into product_options
  (product_type, code, name, selection, required, sort_order,
   depends_on_code, depends_on_value, forced_values)
values
  ('track', 'return', 'Return', 'single', true, 3,
   'opening', 'OW', '{"CO": "both", "FREE": "none"}'::jsonb)
on conflict (product_type, code) do nothing;

insert into product_option_choices (option_id, value, label, sort_order, is_default, selectable)
select o.id, v.value, v.label, v.sort_order, v.is_default, v.selectable
  from product_options o,
       (values ('l',    'Left',              1, false, true),
               ('r',    'Right',             2, false, true),
               ('both', 'Both ends',         3, false, false),
               ('none', 'No return',         4, false, false)) as v(value, label, sort_order, is_default, selectable)
 where o.product_type = 'track' and o.code = 'return'
on conflict (option_id, value) do nothing;


-- --------------------------------------------------------------- Operation --
-- Constant across all 8 products today, so it supplies no recipe lines. It
-- exists so cord, wand or motor can be added later as choices rather than as
-- a new product range.
insert into product_options (product_type, code, name, selection, required, sort_order)
values ('track', 'operation', 'Operation', 'single', true, 4)
on conflict (product_type, code) do nothing;

insert into product_option_choices (option_id, value, label, sort_order, is_default)
select o.id, 'HD', 'Hand draw', 1, true
  from product_options o
 where o.product_type = 'track' and o.code = 'operation'
on conflict (option_id, value) do nothing;


-- ============================================================================
-- Blind options are deliberately not seeded. That side is greenfield — the one
-- existing blind product has a single recipe line — so there is nothing to
-- derive and the list is yours to specify rather than mine to guess.
-- ============================================================================


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- delete from product_options where product_type = 'track';
--   (choices cascade)
