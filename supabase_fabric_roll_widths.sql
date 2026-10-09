-- ============================================================================
-- The executable copy is supabase/migrations/*_fabric_roll_widths.sql. This
-- file is the annotated record of WHY. Change both or neither.
-- ============================================================================
--
-- Fabric: a job is cut from the roll width that wastes least
--
-- A fabric could already list several widths (components.roll_widths), but
-- nothing chose between them: every job nested into the WIDEST, and a purchase
-- order line for fabric carried no width at all — it was a number of "rolls",
-- and the width was only asked for when the delivery turned up.
--
-- Three things change, and each needs somewhere to live.
--
-- ---------------------------------------------------------------------------
-- 1. mfg_jobs.fabric_plan
--
-- Each fabric and colour on a job is now laid out on every width it can be
-- ordered in, and cut from the ONE width that takes the fewest square metres.
-- One width, never two: a second roll is a second cut charge, which costs more
-- than the fabric a split would save. Stock is tried first — anything that
-- fits a roll or offcut on the shelf comes off that, and only the rest is
-- ordered.
--
-- Both halves of that can be overruled per job, and this is where the
-- overruling is kept:
--
--     { "<component id>__<colour suffix>": { "source": "order", "width": 3000 } }
--
--     source  'order' leaves the shelf alone and orders the lot. Absent means
--             stock first.
--     width   forces the ordered roll's width. Absent means least waste.
--
-- Null, or a fabric with no entry, is "decide for me" — which is what every
-- existing job gets, so nothing has to be backfilled.
--
-- ---------------------------------------------------------------------------
-- 2. purchase_order_lines.roll_width_mm
--
-- Fabric is bought as a CUT LENGTH: so many metres off a roll of a stated
-- width. So a fabric line now says which width, its quantity is metres, and
-- its unit price is per metre AT that width — the supplier's rate is per m²,
-- so a metre of a 2.5m roll costs less than a metre of a 3m one.
--
-- Null on every line that is not a cut length, including every fabric line
-- raised before this: those keep reading as a number of rolls, exactly as
-- they were sent.
--
-- The quantity columns become numeric because 22.8 metres is a quantity now.
-- Guarded, so a database where they already are — or where something depends
-- on their type — carries on rather than failing the whole migration.
--
-- ---------------------------------------------------------------------------
-- 3. The widths themselves — SHAW, Textile Link COD price matrix, Sept 2026
--
-- Only fabrics already in the library, matched by hand against the list:
--
--     Duo Screen   2.5m and 3.2m             was 3.2m only
--     Vibe BO      2.0m, 2.5m and 3.0m       was 3.0m only   ("Vibe Roller")
--     Duo Block    3.0m                      unchanged       ("Duo Blockout 300")
--     Toorak BO    not on this list          untouched
--
-- Vibe BO's price is corrected in the same statement. It was on file at $7.00
-- per LINEAR metre; the list has it at $7.03 per SQUARE metre, which is $21.09
-- a metre off the 3m roll. The m² figure had been typed in as a per-metre
-- price, so every Vibe blind was costed at a third of what the fabric costs.
-- Duo Block ($21.93/m at 3.0m) and Duo Screen ($19.88/m at 3.2m) already match
-- the list's "New Price" and are left alone.
--
-- A fabric row holds its price one of two ways, told apart by its unit:
-- 'metres' is per linear metre of its WIDEST roll, 'm²' is the rate itself.
-- The app reads either (src/lib/fabricEngine.js, fabricSqmRate) and saves m²
-- whenever a fabric is edited, so the update writes whichever form the row is
-- already in rather than assuming.
--
-- No confirmed job is affected: price_snapshot/qty_snapshot freeze a job at
-- confirm time. Any job NOT yet confirmed re-costs its Vibe at the corrected
-- rate, and may move to a narrower roll.
--
-- Re-running is a no-op.
-- ============================================================================

alter table mfg_jobs add column if not exists fabric_plan jsonb;

alter table purchase_order_lines add column if not exists roll_width_mm numeric;

do $$ begin
  alter table purchase_order_lines
    add constraint purchase_order_lines_roll_width_check
    check (roll_width_mm is null or roll_width_mm > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table purchase_order_lines alter column qty_ordered  type numeric;
  alter table purchase_order_lines alter column qty_received type numeric;
exception when others then
  raise notice 'purchase_order_lines quantities left as they are: %', sqlerrm;
end $$;

update components c
   set roll_widths = '[2500, 3200]'::jsonb
  from suppliers s
 where s.id = c.supplier_id and s.name = 'SHAW'
   and c.order_type = 'fabric' and c.name = 'Duo Screen';

update components c
   set roll_widths = '[2000, 2500, 3000]'::jsonb,
       unit_cost   = case when c.unit = 'm²' then 7.03 else 21.09 end
  from suppliers s
 where s.id = c.supplier_id and s.name = 'SHAW'
   and c.order_type = 'fabric' and c.name = 'Vibe BO';


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- update components c set roll_widths = '[3000]'::jsonb, unit_cost = 7
--   from suppliers s where s.id = c.supplier_id and s.name = 'SHAW'
--    and c.order_type = 'fabric' and c.name = 'Vibe BO';
-- update components c set roll_widths = '[3200]'::jsonb
--   from suppliers s where s.id = c.supplier_id and s.name = 'SHAW'
--    and c.order_type = 'fabric' and c.name = 'Duo Screen';
-- alter table purchase_order_lines drop constraint if exists purchase_order_lines_roll_width_check;
-- alter table purchase_order_lines drop column if exists roll_width_mm;
-- alter table mfg_jobs drop column if exists fabric_plan;
