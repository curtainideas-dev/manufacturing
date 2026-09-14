-- Carriers and brackets onto the track cut sheet
--
-- The track sheet gives a COUNT COLUMN to every kind ticked on_cut_sheet —
-- the part and the schedule figure it was read off ("60mm S-Wave Carrier,
-- 2×36 = 72"), which is what the bench threads on and screws in. That is the
-- same tick the blind sheet reads to print its spec line: "does the bench
-- need to see this?" is one question, and each sheet answers it in the shape
-- it has room for.
--
-- Deliberately NOT a new column saying "this kind is a carrier". The kind
-- named Carrier already is that statement, and a second field that agrees
-- with it today is a field that can disagree with it tomorrow.
--
-- Only the first three ticked kinds that a job actually uses become columns —
-- the page has no room for a fourth. Anything past that prints on the spec
-- line under each row instead, so nothing is lost by ticking one more.

update component_kinds set on_cut_sheet = true
 where name in ('Carrier', 'Track Bracket');
-- Expect: UPDATE 2
--
-- Those are the kinds as they stand today: Carrier holds the 60mm S-Wave
-- Carrier (and NOT the Wand Carrier, which is a different kind of thing), and
-- Track Bracket holds the six fixing brackets — not Blind Bracket Cover, which
-- is its own kind and belongs to the other product type. If you rename them,
-- tick the new names in Admin → Component Kinds; nothing in the code looks for
-- these two strings.

-- ============================================================================
-- VERIFY
-- ============================================================================
-- select name, ask_on_job, on_cut_sheet from component_kinds order by sort_order;
--
-- The parts that will fill those columns (should be your carriers and the
-- track brackets, and nothing else):
-- select k.name as kind, c.name as part, c.order_type
--   from component_kinds k join components c on c.kind = k.name
--  where k.on_cut_sheet order by k.name, c.name;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- update component_kinds set on_cut_sheet = false
--  where name in ('Carrier', 'Track Bracket');

-- ============================================================================
-- COLUMN ORDER
-- ============================================================================
-- The sheet gives the columns to the kinds used on the most windows, and
-- orders kinds level on that by their sort_order — the order they appear in
-- Admin → Component Kinds. So to put carriers before brackets, put Carrier
-- above Bracket there. Nothing needs to change in code.
