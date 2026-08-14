-- ============================================================================
-- Phase 1, step 1 of 3 — schema
--
-- Additive only. Every new column is nullable or defaulted and no existing
-- column changes type, so the app behaves exactly as it does today after this
-- runs. Nothing here depends on steps 2 or 3.
--
-- Rollback: the inverse drops are listed at the bottom, commented out.
-- ============================================================================


-- ---------------------------------------------------------------- products --
-- A product is now a single identifier: a profile code for tracks (TCO51),
-- a fabric category for blinds (Bancoora). Everything that used to live in
-- the name is an option answered per window.

alter table products add column if not exists product_type text;

update products
   set product_type = case when category = 'blind' then 'blind' else 'track' end
 where product_type is null;                  -- 'sheer' folds into track

alter table products alter column product_type set not null;

do $$ begin
  alter table products add constraint products_product_type_check
    check (product_type in ('track','blind'));
exception when duplicate_object then null; end $$;

-- The buffer applied to cost for the internal reference price. Not a margin
-- and not a quoted price — see market_matrix for what it's compared against.
alter table products add column if not exists markup numeric not null default 1.6;

-- Market trade list, pasted from the price sheet:
--   { "widths": [1000,...], "drops": [1000,...], "prices": [[61,64,...], ...] }
-- Margin at list = (list - cost) / list.
alter table products add column if not exists market_matrix jsonb;

-- Blinds only: which fabric category fills this product's fabric slot.
alter table products add column if not exists fabric_category text;

-- Superseded products stay for historical jobs but leave the picker.
alter table products add column if not exists archived boolean not null default false;


-- -------------------------------------------------------------- components --
-- Tags a stock component into a fabric category, so the customise modal can
-- offer the fabrics that belong to the blind being ordered.
alter table components add column if not exists fabric_category text;


-- ----------------------------------------------------------- colour groups --
-- Recipe lines are tagged to a group; the window picks one colour per group
-- and each line resolves it against its own component's variant list.
create table if not exists colour_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  applies_to  text not null default 'both' check (applies_to in ('track','blind','both')),
  sort_order  integer not null default 0,
  created_at  timestamptz default now()
);

insert into colour_groups (name, applies_to, sort_order) values
  ('Track',    'track', 1),
  ('Hardware', 'both',  2),
  ('Fabric',   'blind', 3)
on conflict (name) do nothing;


-- ----------------------------------------------------------------- options --
-- Options are defined per product type, so every track shares one question
-- set. Which components a choice supplies is per product (see
-- product_components.option_choice_id below), because TCO51's face-fix
-- bracket is not necessarily TCO52's.
create table if not exists product_options (
  id            uuid primary key default gen_random_uuid(),
  product_type  text not null check (product_type in ('track','blind')),
  code          text not null,        -- stable key stored in mfg_windows.config
  name          text not null,        -- shown in the modal
  selection     text not null default 'single'
                check (selection in ('single','multi','qty')),
  required      boolean not null default false,
  spec_only     boolean not null default false,  -- no BOM and no cost impact
  sort_order    integer not null default 0,

  -- Conditional visibility. When depends_on_code is set the option is only
  -- asked while that option's answer equals depends_on_value.
  depends_on_code   text,
  depends_on_value  text,

  -- When hidden, the answer may still be decided rather than skipped:
  --   {"CO": "both", "FREE": "none"}
  -- reads as "when the option named by depends_on_code is CO, this option's
  -- answer is 'both'". A hidden option with a forced value is never missing.
  forced_values     jsonb,

  -- Pricing effects beyond the components a choice supplies. For a 'qty'
  -- option, cost_surcharge is multiplied by the quantity entered.
  cost_surcharge  numeric not null default 0,
  sell_surcharge  numeric not null default 0,
  markup_override numeric,

  created_at    timestamptz default now(),
  unique (product_type, code)
);

create table if not exists product_option_choices (
  id          uuid primary key default gen_random_uuid(),
  option_id   uuid not null references product_options(id) on delete cascade,
  value       text not null,          -- stored in config: 'CO', 'FACE', 'both'
  label       text not null,          -- shown in the modal: 'Centre open'
  sort_order  integer not null default 0,
  is_default  boolean not null default false,

  -- false = reachable only through another option's forced_values, never
  -- offered as a button. Return's 'both' and 'none' are decided by the
  -- opening and must not be pickable on their own.
  selectable  boolean not null default true,

  cost_surcharge numeric not null default 0,
  sell_surcharge numeric not null default 0,
  created_at  timestamptz default now(),
  unique (option_id, value)
);


-- ------------------------------------------------------- recipe line rules --
-- product_id stays required: every line belongs to a product. option_choice_id
-- being null means the line is part of the base recipe and is always included;
-- non-null means it is supplied only when that choice is selected.
alter table product_components
  add column if not exists option_choice_id uuid references product_option_choices(id) on delete cascade;

-- Lines sharing a group_key are mutually exclusive — exactly one survives.
-- Precedence: window override, then option-supplied, then dimension band,
-- then the plain base line. This is what swaps 38/43/48mm tube by width and
-- what lets an add-on replace a standard part.
alter table product_components add column if not exists group_key text;

-- A line only contributes when the window's dimensions fall inside its range.
-- Null means unbounded, so existing lines are unaffected.
alter table product_components add column if not exists active_min_width numeric;
alter table product_components add column if not exists active_max_width numeric;
alter table product_components add column if not exists active_min_drop  numeric;
alter table product_components add column if not exists active_max_drop  numeric;

-- Which colour group this line follows. The existing colour_variant column
-- stays as the fallback when a window makes no pick for the group.
alter table product_components
  add column if not exists colour_group_id uuid references colour_groups(id);

create index if not exists product_components_option_choice_idx
  on product_components(option_choice_id);
create index if not exists product_components_group_key_idx
  on product_components(product_id, group_key);


-- ----------------------------------------------------------------- windows --
-- The answers given in the customise modal:
--   { "options":  { "fixing": "FACE", "opening": "CO", "return": "both" },
--     "colours":  { "<colour_group_id>": "White" },
--     "overrides":{ "Tube": "<product_component_id>" },
--     "fabric_component_id": "<uuid>" }
alter table mfg_windows add column if not exists config jsonb not null default '{}'::jsonb;


-- ============================================================================
-- Note, not a change: products.formula_divisor — sorry, product_components.
-- formula_divisor is written on every recipe line by App.jsx and read by no
-- calculation anywhere in the app. It is deliberately left in place here;
-- dropping it is a separate, destructive change once the writes are removed.
-- ============================================================================


-- ============================================================================
-- ROLLBACK (uncomment to reverse this step)
-- ============================================================================
-- drop index if exists product_components_group_key_idx;
-- drop index if exists product_components_option_choice_idx;
-- alter table product_components
--   drop column if exists option_choice_id,
--   drop column if exists group_key,
--   drop column if exists colour_group_id,
--   drop column if exists active_min_width,
--   drop column if exists active_max_width,
--   drop column if exists active_min_drop,
--   drop column if exists active_max_drop;
-- alter table mfg_windows drop column if exists config;
-- drop table if exists product_option_choices;
-- drop table if exists product_options;
-- drop table if exists colour_groups;
-- alter table components drop column if exists fabric_category;
-- alter table products
--   drop constraint if exists products_product_type_check,
--   drop column if exists product_type,
--   drop column if exists markup,
--   drop column if exists market_matrix,
--   drop column if exists fabric_category,
--   drop column if exists archived;
