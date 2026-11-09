-- ============================================================================
-- Blind fabric: price per linear metre, not per m²
--
-- A blind can't be railroaded (see supabase_fabric_pricing.sql and
-- src/lib/fabricEngine.js) — the fabric has to wind onto the tube the same way
-- it comes off the roll. So every cut trims a strip the FULL WIDTH of the roll
-- however narrow the blind is: a 600mm blind and a 2000mm blind of the same
-- drop burn exactly the same fabric, and the offcut can't be reused on another
-- window.
--
-- Pricing on the blind's own width × drop therefore undercharged narrow blinds
-- for material nobody could recover. Since only one roll width is stocked, that
-- width is a constant and folds into the rate — fabric is now quoted per linear
-- metre pulled off the roll, and the blind's width no longer affects its cost.
--
-- Existing figures are $/m² against a 3000mm roll, so they convert at ×3.0:
--   categories   A $7 -> $21   B $10 -> $30   C $20 -> $60
--                D $30 -> $90  E $40 -> $120  F $50 -> $150
--   fabrics      Bancoora $6.83 -> $20.49, the rest $7 -> $21
--
-- Both sides scale together, so category classification (a fabric's own cost
-- against each ceiling) is unchanged.
--
-- BLIND FABRIC COSTS DO CHANGE, AND SUBSTANTIALLY. That is the point of the
-- fix, not a side effect: the old basis billed a blind for its own footprint
-- only, so every millimetre of roll width beyond the blind was free. A blind
-- W metres wide now costs (3.0 / W) times its old fabric figure —
--
--     2400mm blind  ->  1.25x        1400mm blind  ->  2.1x
--     1500mm blind  ->  2.0x          564mm blind  ->  5.3x
--
-- and only a full-3000mm blind is unchanged. Measured against job 1002480
-- (28 blind windows): fabric went $404.37 -> $1,142.40, up $738.03 — exactly
-- the offcut figure the old model never charged for.
--
-- This corrects understated COST. Whether customer sell prices follow is a
-- separate commercial decision.
--
-- No confirmed job is affected: price_snapshot/qty_snapshot freeze a job at
-- confirm time, and no snapshot on file contains a fabric line.
--
-- Guarded on components.unit so re-running is a no-op rather than a ×9 error.
-- ============================================================================

do $$
declare
  roll_width_m constant numeric := 3.0;  -- the one stocked width, in metres
begin
  if not exists (select 1 from components where order_type = 'fabric') then
    raise exception
      'No fabric components found — cannot tell whether prices are already per-metre. Convert fabric_categories by hand.';
  end if;

  if not exists (select 1 from components where order_type = 'fabric' and unit = 'm²') then
    raise notice 'Fabric prices are already per linear metre — nothing to do.';
    return;
  end if;

  update fabric_categories
     set max_price = max_price * roll_width_m;

  update components
     set unit_cost = unit_cost * roll_width_m,
         unit      = 'metres'
   where order_type = 'fabric';

  raise notice 'Converted fabric pricing to per linear metre (x%).', roll_width_m;
end $$;


-- ============================================================================
-- ROLLBACK  (only valid if nothing has been re-priced by hand since)
-- ============================================================================
-- update fabric_categories set max_price = max_price / 3.0;
-- update components set unit_cost = unit_cost / 3.0, unit = 'm²'
--  where order_type = 'fabric';
