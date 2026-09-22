-- ============================================================================
-- Base rails are bars, not packs
--
-- All three base rails were order_type 'pack' with unit 'metres', which modelled
-- "a bar" as "a pack of N metres". It costed correctly and it is wrong about
-- everything else: a pack has no length, so the cut planner never saw them, and
-- the bench got no cutting plan for the one part on a blind that is sawn to
-- length beside the tube.
--
-- Two things have to move with the flag, and neither is optional.
--
-- 1. THE BAR LENGTH. bar_length_mm is 6000 on all three — an untouched default,
--    and not what they buy. pack_qty is the real length of one bar in metres,
--    and it reconciles exactly against the recorded unit cost:
--
--      TBS Q-Bar   5.4 m @ $18.50  ->  $3.42592592…/m   = unit_cost on file
--      KPS Oval    5.0 m @ $18.50  ->  $3.70/m          = unit_cost on file
--
--    So the conversion below derives bar_length_mm from pack_qty rather than
--    trusting the column, and the derived unit cost (bar_price / bar_length_mm
--    x 1000) comes out identical to the penny. Nothing reprices.
--
--    Left as 6000 they would be planned against a bar that does not exist:
--    three 1,900mm cuts fit 6,000mm and do not fit 5,400mm, so the plan would
--    call for one bar and the bench would run out mid-cut.
--
-- 2. THE STOCK UNIT. This is the trap the app has been bitten by before.
--    stock.qty_on_hand does NOT mean the same thing either side of this change:
--
--      pack  a count in the component's own unit  -> metres, here
--      bar   a count of WHOLE BARS, with every offcut its own stock_bars row
--
--    Flipping the flag alone silently rereads TBS White's 22.5 as 22.5 BARS —
--    121.5 m, a 5.4x inflation — and qty_minimum 20 as 20 bars, which is 108 m
--    and would stop the reorder alert ever firing again.
--
--    So the metres on hand are split into whole bars plus one offcut for the
--    remainder, which is what is physically on the rack anyway. Total length is
--    preserved exactly:
--
--      TBS White      22.5 m -> 4 bars (21.6 m) + 900mm offcut   = 22.5 m
--      TBS Anodised   29.0 m -> 5 bars (27.0 m) + 2,000mm offcut = 29.0 m
--      KPS Shoji       2.45 m -> 0 bars         + 2,450mm offcut = 2.45 m
--
--    Those figures are worked out IN SQL from whatever is on hand when you run
--    this, not hardcoded from when it was written, so a deduction between now
--    and then cannot make it wrong. The remainders become real offcuts the cut
--    planner will use before it opens a new bar.
--
--    qty_minimum rounds UP to whole bars: understating a minimum is the failure
--    that does not announce itself.
--
-- Costing is unaffected. The recipe line is width_based on unit 'metres', and
-- calcQty reads cost_type and unit, never order_type. Ordering is unaffected
-- too: poEngine reads bar_price for a bar, which is set to the pack price of
-- one bar.
--
-- SAFE TO RE-RUN. Every statement is guarded on order_type = 'pack', so a
-- second run finds nothing to do rather than splitting the stock twice.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The remainder that isn't a whole bar becomes an offcut.
--    FIRST, while qty_on_hand is still in metres.
-- ---------------------------------------------------------------------------
insert into stock_bars (component_id, colour_variant, label, length_mm, status)
select
  s.component_id,
  s.colour_variant,
  'Converted from ' || round(s.qty_on_hand::numeric, 2) || 'm on hand',
  round((s.qty_on_hand - floor(s.qty_on_hand / c.pack_qty) * c.pack_qty) * 1000),
  'available'
from stock s
join components c on c.id = s.component_id
where c.kind = 'Base Rail'
  and c.order_type = 'pack'
  and c.pack_qty > 0
  -- Priced rails only, matching step 3. D30 carries pack_qty 1 / pack_price 0,
  -- which is a placeholder and not a 1m bar; dividing metres by it would read
  -- them as 1-metre bars. It has no stock today, and this keeps it that way.
  and c.pack_price > 0
  -- Only where something is genuinely left over once the whole bars are taken.
  -- A 1mm rounding crumb is not an offcut anybody will ever cut from.
  and round((s.qty_on_hand - floor(s.qty_on_hand / c.pack_qty) * c.pack_qty) * 1000) >= 50;

-- ---------------------------------------------------------------------------
-- 2. Metres on hand -> whole bars. Minimum rounds up.
-- ---------------------------------------------------------------------------
update stock s set
  qty_on_hand = floor(s.qty_on_hand / c.pack_qty),
  qty_minimum = ceil(coalesce(s.qty_minimum, 0) / c.pack_qty)
from components c
where c.id = s.component_id
  and c.kind = 'Base Rail'
  and c.order_type = 'pack'
  and c.pack_qty > 0
  and c.pack_price > 0;

-- ---------------------------------------------------------------------------
-- 3. The component itself. bar_length_mm from pack_qty, not from the column.
-- ---------------------------------------------------------------------------
update components set
  order_type    = 'bar',
  bar_length_mm = pack_qty * 1000,
  bar_price     = pack_price
where kind = 'Base Rail'
  and order_type = 'pack'
  and pack_qty > 0
  and pack_price > 0;

-- ---------------------------------------------------------------------------
-- 4. D30 Base Rail — converted, but NOT given a length.
--
-- It carries pack_qty 1 / pack_price 0, which is placeholder data, not a 1m
-- bar at no cost. It is in no recipe and has no stock, so nothing depends on
-- it today. bar_length_mm is deliberately nulled rather than left at the 6000
-- default: the app then says "no bar length set" in plain sight, which is what
-- you want, instead of quietly planning cuts against a bar nobody buys.
--
-- Set its real length and price before putting it in a recipe.
-- ---------------------------------------------------------------------------
update components set
  order_type    = 'bar',
  bar_length_mm = null,
  bar_price     = null
where kind = 'Base Rail'
  and order_type = 'pack'
  and coalesce(pack_price, 0) = 0;

commit;


-- ============================================================================
-- VERIFY — unit cost must be unchanged, and length must reconcile
-- ============================================================================
-- select name, order_type, unit, bar_length_mm, bar_price,
--        round((bar_price / nullif(bar_length_mm,0)) * 1000, 4) as derived_per_m,
--        round(unit_cost::numeric, 4) as unit_cost_on_file
--   from components where kind = 'Base Rail' order by name;
--   -- expect derived_per_m = unit_cost_on_file (3.4259 / 3.7000), D30 all null
--
-- select c.name, s.colour_variant->>'name' as colour, s.qty_on_hand as bars,
--        s.qty_minimum as min_bars,
--        (s.qty_on_hand * c.bar_length_mm
--          + coalesce((select sum(b.length_mm) from stock_bars b
--                       where b.component_id = s.component_id
--                         and b.colour_variant->>'suffix' = s.colour_variant->>'suffix'
--                         and b.status = 'available'), 0)) / 1000.0 as total_m
--   from stock s join components c on c.id = s.component_id
--  where c.kind = 'Base Rail' order by c.name;
--   -- expect total_m = 22.50 (TBS White), 29.00 (TBS Anodised), 2.45 (KPS Shoji)


-- ============================================================================
-- ROLLBACK — metres back onto the stock row, offcuts removed
-- ============================================================================
-- begin;
-- update stock s set
--   qty_on_hand = s.qty_on_hand * c.pack_qty
--     + coalesce((select sum(b.length_mm) / 1000.0 from stock_bars b
--                  where b.component_id = s.component_id
--                    and b.colour_variant->>'suffix' = s.colour_variant->>'suffix'
--                    and b.label like 'Converted from %m on hand'), 0),
--   qty_minimum = round(s.qty_minimum * c.pack_qty)
-- from components c
-- where c.id = s.component_id and c.kind = 'Base Rail' and c.order_type = 'bar';
-- delete from stock_bars b using components c
--  where c.id = b.component_id and c.kind = 'Base Rail'
--    and b.label like 'Converted from %m on hand';
-- update components set order_type = 'pack', bar_length_mm = 6000, bar_price = 0
--  where kind = 'Base Rail';
-- commit;
