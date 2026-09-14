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
 where name in ('Carrier', 'Bracket');
-- Expect: UPDATE 2
--
-- If your kinds are named differently, tick them in Admin → Component Kinds
-- instead — nothing in the code looks for these two names.

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
--  where name in ('Carrier', 'Bracket');

-- ============================================================================
-- COLUMN ORDER
-- ============================================================================
-- The sheet gives the columns to the kinds used on the most windows, and
-- orders kinds level on that by their sort_order — the order they appear in
-- Admin → Component Kinds. So to put carriers before brackets, put Carrier
-- above Bracket there. Nothing needs to change in code.
