-- Each job represents one customer order / work order
create table mfg_jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text,
  customer_name text,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_at timestamptz default now()
);

-- Each window is one blind or track within a job
-- Width and drop are stored in mm
create table mfg_windows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references mfg_jobs(id) on delete cascade,
  product_type text not null check (product_type in ('roller_blind', 'track')),
  label text,
  width_mm numeric not null,
  drop_mm numeric not null,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- Each BOM line is one component calculated for one window
-- override_qty allows the factory to manually adjust a calculated value
create table mfg_bom_lines (
  id uuid primary key default gen_random_uuid(),
  window_id uuid not null references mfg_windows(id) on delete cascade,
  component_id uuid not null references components(id),
  calculated_qty numeric not null,
  override_qty numeric,
  unit_cost_snapshot numeric not null,
  created_at timestamptz default now()
);
