-- ============================================================================
-- Fabric drop allowance
--
-- A blind's fabric isn't cut to the raw window drop — the workroom needs
-- extra length for a hem, a pattern repeat, or the wrap onto the tube, and
-- that allowance is specific to the product (its fabric category, how it's
-- fitted), not to any one window. Set once per product, next to its fabric
-- category, and added to every window's drop before the fabric quantity and
-- price are worked out. Doesn't touch the window's own recorded drop.
--
-- Additive and defaulted to 0, so existing products price exactly as before.
-- ============================================================================

alter table products add column if not exists fabric_drop_allowance_mm integer not null default 0;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- alter table products drop column if exists fabric_drop_allowance_mm;
