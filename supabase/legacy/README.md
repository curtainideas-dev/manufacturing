# Legacy SQL scripts

Until October 2026 schema changes were hand-run in the Supabase SQL editor from
loose `supabase_*.sql` files at the repo root. They live here now, unchanged,
as a record of how the database got its shape. Code comments still refer to
them by file name.

**Don't re-run these.** Every table and column they create is already in the
live database (checked 2026-11-09, including `company_addresses`,
`deleted_records`, `component_kinds` and `product_components.drop_limit`, so the
"NOT YET APPLIED" note in `supabase_po_delivery_pickup.sql` is out of date).
The one-off data scripts (`tco51_*`, `track_options`, `catA_chain_by_drop`) would
duplicate rows.

New changes go in `supabase/migrations/` as timestamped files, applied with the
Supabase CLI (`supabase db push`).

| File | What it did |
|---|---|
| `supabase_module3.sql` | Original jobs/windows schema (statuses were draft/confirmed then) |
| `supabase_component_substitutions.sql` | Swapping one component for another on a job or window |
| `supabase_add_discount.sql` | Discount on recipe lines |
| `supabase_options_schema.sql` | Per-product-type options and choices |
| `supabase_track_options.sql`, `supabase_tco51_build.sql`, `supabase_tco51_cutover.sql` | One-off: folded the TCO51 track products into one product with options (data) |
| `supabase_drop_limits.sql` | Drop limit per width on recipe lines |
| `supabase_fabrics.sql`, `supabase_fabric_*.sql` | Fabric as a component, roll widths, allowances, per-metre costing, width nesting |
| `supabase_fabric_pricing.sql` | Cost-side flat category rates (superseded by `price_grids`) |
| `supabase_price_grids.sql` | Wholesaler sell grids and gross profit |
| `supabase_catA_chain_by_drop.sql` | One-off: Category A chain picked by drop (data) |
| `supabase_component_kind.sql`, `supabase_component_kinds_table.sql` | Component kinds as a managed list |
| `supabase_kind_ask_on_job.sql`, `supabase_kind_on_cut_sheet.sql`, `supabase_kind_on_label.sql` | Kind flags |
| `supabase_job_role_slots.sql` | Per-line job questions (superseded by `kind_ask_on_job`) |
| `supabase_cut_sheet_track_kinds.sql` | Carriers and brackets on the track cut sheet |
| `supabase_base_rails_are_bars.sql` | Base rails stocked as bars |
| `supabase_extra_lines.sql` | Ad-hoc BOM lines on jobs and windows |
| `supabase_job_product_type.sql` | Track/blind type on a job |
| `supabase_stock_restore.sql` | Reversible stock deductions |
| `supabase_cut_plan_offcuts.sql` | Planned offcuts recorded after cutting |
| `supabase_deleted_records.sql` | Recycle bin for deleted jobs and windows |
| `supabase_po_receiving.sql` | Receiving purchase orders, letterhead details |
| `supabase_po_line_overrides.sql`, `supabase_po_line_colour.sql`, `supabase_po_delivery_pickup.sql`, `supabase_fabric_roll_widths.sql` | Copies of the four files in `supabase/migrations/` |
| `supabase_job_notifications.sql` | pg_net email triggers (see `docs/NOTIFICATIONS.md`) |
