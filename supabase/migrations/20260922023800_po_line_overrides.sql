alter table purchase_order_lines add column if not exists description text;
alter table purchase_order_lines add column if not exists order_unit  text;
