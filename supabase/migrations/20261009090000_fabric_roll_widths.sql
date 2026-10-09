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
