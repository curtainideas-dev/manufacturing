-- ============================================================================
-- APPLIED via the Supabase CLI — see supabase/migrations/*_po_line_colour.sql,
-- which is the copy that actually ran. This file is the annotated record of
-- WHY; that one is the executable statement. Change both or neither.
--
-- Purchase order lines: the colour, in the supplier's words
--
-- Colour joins description and order_unit as a line-level override. Same
-- reason as those two: what we call a finish and what the supplier calls it
-- are not always the same word, and an order that does not use theirs gets
-- queried. We say "Anodised Silver"; their list may say "Silver Anodised",
-- "SA", or a code.
--
-- WHAT THIS DOES NOT CHANGE, and the distinction matters:
--
--   colour_variant  the structural pick. It decides the part number suffix
--                   (B2-RB034-AS) and which stock row the line draws from when
--                   the delivery is received. Untouched by this column.
--   colour          what gets PRINTED in the Colour column, when the
--                   supplier's word differs from ours.
--
-- So typing "SA" over "Anodised Silver" changes the sheet and nothing else:
-- the part number still resolves through the variant, and receiving still
-- books the goods to the Anodised Silver shelf. That separation is the point
-- — it lets an order read the supplier's way without moving any stock.
--
-- Null means "use the colour variant's own name", which is every line that
-- exists today, so nothing changes until someone deliberately types over it.
-- ============================================================================

alter table purchase_order_lines add column if not exists colour text;


-- ============================================================================
-- VERIFY
-- ============================================================================
-- select id, colour, colour_variant->>'name' as variant_name
--   from purchase_order_lines limit 5;
--   -- expect colour null on every existing line, variant_name unchanged

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- alter table purchase_order_lines drop column if exists colour;
