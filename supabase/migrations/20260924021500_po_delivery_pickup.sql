create table if not exists company_addresses (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  address    text not null,
  note       text,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists company_addresses_one_default_idx
  on company_addresses (is_default) where is_default;

insert into company_addresses (label, address, note, is_default)
select 'Workshop',
       coalesce(nullif(btrim(c.delivery_address), ''), c.address),
       nullif(btrim(c.delivery_note), ''),
       true
  from company_details c
 where c.id = 1
   and coalesce(nullif(btrim(c.delivery_address), ''), nullif(btrim(c.address), '')) is not null
   and not exists (select 1 from company_addresses);

alter table purchase_orders
  add column if not exists fulfilment text not null default 'delivery';

alter table purchase_orders
  add column if not exists delivery_address_id uuid
  references company_addresses(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_orders_fulfilment_chk') then
    alter table purchase_orders
      add constraint purchase_orders_fulfilment_chk check (fulfilment in ('delivery', 'pickup'));
  end if;
end $$;
