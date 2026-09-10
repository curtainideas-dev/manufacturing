-- Make a stock deduction reversible
--
-- Deleting a job that had stock deducted used to leave the stock deducted --
-- the confirm dialog said so, and that was the whole remedy. To offer to put
-- it back instead, the reversal has to know what to put back, and today it
-- cannot, because a deduct movement does not record what it did to the stock
-- row. It records the BOM quantity, which is a different number for two of the
-- three kinds of part:
--
--   pack     qty_on_hand -= qty          movement.qty IS the change.  ✔
--   bar      qty_on_hand -= <full bars>  movement.qty is MILLIMETRES. �’
--   fabric   qty_on_hand untouched       movement.qty is METRES.      ✗
--
-- Crediting movement.qty back would hand a bar component thousands of imaginary
-- bars and invent fabric that was never debited. So the actual change is now
-- recorded alongside it.
--
--   qty_on_hand_delta   what this movement did to stock.qty_on_hand, signed
--                       and in the stock row's own units. Negative on a
--                       deduction. 0 where the row was untouched (fabric, and
--                       bars cut only from existing offcuts).
--
-- Bars and fabric are held as individual pieces in stock_bars, not as a count,
-- and those are reversed separately: the pieces this job consumed are marked
-- used with its job_id, so returning them is a status change, and the offcuts
-- it created now carry the same job_id so they can be taken back out again.

alter table stock_movements add column if not exists qty_on_hand_delta numeric;


-- ------------------------------------------------------------- backfill --
-- Only for pack components, where the BOM quantity and the stock change are
-- the same number and the fill-in is therefore a fact rather than a guess.
-- Bars and fabric are deliberately left NULL: the figure was never recorded
-- and cannot be recovered, and a null says "unknown" where a 0 would lie.
-- The app reads null as "this line can't be returned automatically" and says
-- so, rather than silently returning nothing.

update stock_movements m
   set qty_on_hand_delta = m.qty
  from components c
 where c.id = m.component_id
   and m.movement_type = 'deduct'
   and m.qty_on_hand_delta is null
   and coalesce(c.order_type, 'pack') = 'pack';


-- ============================================================================
-- VERIFY — what is now reversible, and what is not
-- ============================================================================
-- select coalesce(c.order_type,'pack') as kind,
--        count(*)                                  as deduct_movements,
--        count(m.qty_on_hand_delta)                as reversible,
--        count(*) - count(m.qty_on_hand_delta)     as needs_manual
--   from stock_movements m
--   join components c on c.id = m.component_id
--  where m.movement_type = 'deduct'
--  group by 1 order by 1;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- alter table stock_movements drop column if exists qty_on_hand_delta;
