-- ============================================================================
-- Blind fabric allowances
--
-- Extends supabase_fabric_drop_allowance.sql with the other two per-product
-- fabric figures. All three sit together next to the product's fabric
-- category, and none of them touches a window's recorded width or drop —
-- they only change how much fabric that window is costed for.
--
--   fabric_width_deduction_mm   cut-width spec: the fabric is cut this much
--                               narrower than the window. Does NOT affect
--                               cost — blinds are charged by length off a
--                               fixed-width roll (see
--                               supabase_fabric_per_metre.sql), so width is
--                               no longer a cost driver. It's here so the
--                               factory knows what to cut.
--
--   fabric_drop_wastage_mm      fabric lost making the cut at all — trim,
--                               squaring up, the bit that never reaches the
--                               blind. Adds to the length costed, exactly
--                               like fabric_drop_allowance_mm does.
--
-- Kept as a separate column from fabric_drop_allowance_mm rather than folded
-- into one number: the allowance is fabric the finished blind needs, wastage
-- is fabric nobody ever sees. Same effect on cost, different argument, so
-- they're tuned independently.
--
-- Both additive and defaulted to 0, so existing products cost exactly as
-- before until someone sets them.
-- ============================================================================

alter table products add column if not exists fabric_width_deduction_mm integer not null default 0;
alter table products add column if not exists fabric_drop_wastage_mm    integer not null default 0;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- alter table products
--   drop column if exists fabric_width_deduction_mm,
--   drop column if exists fabric_drop_wastage_mm;
