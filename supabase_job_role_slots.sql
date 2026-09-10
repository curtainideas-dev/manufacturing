-- Job-customisable recipe lines ("role slots")
--
-- A product's recipe names one base rail, one winder, one bracket. A job does
-- not always want them: the customer asked for a different base rail colour,
-- the fabric's supplier only makes that colour in their own profile, the
-- winder we stock is out and a different brand goes in for this job only.
--
-- Free-search swapping already exists (see supabase_component_substitutions.sql)
-- but it is a repair tool — you have to know a line needs changing, find it on
-- the BOM, and pick from every component of that kind. These two columns turn
-- the parts that get asked about routinely into named questions put to whoever
-- is entering the job, up front, with a short curated list of valid answers.
--
--   job_role          The name the question is asked under — "Base rail",
--                     "Winder", "Bracket". NULL (the default) means the line
--                     is not offered at job entry, which is every line today.
--
--   job_alternatives  The components offered as answers, as an array of
--                     components.id text uuids:  ["uuid", "uuid"]
--                     The recipe's own component is ALWAYS offered first and
--                     is never listed here. An empty array is meaningful and
--                     useful: the part itself is fixed, but its COLOUR is
--                     still the operator's to pick.
--
-- The answer is not stored here. It is written to the existing
-- mfg_windows.substitutions map, keyed by the component the recipe asks for,
-- so a role slot and a hand-made swap of the same line are the same record —
-- they cannot disagree, and the BOM, costing, stock deduction and price
-- snapshot all keep working unchanged.

alter table product_components add column if not exists job_role text;
alter table product_components add column if not exists job_alternatives jsonb not null default '[]'::jsonb;

-- Rollback
-- alter table product_components drop column if exists job_role;
-- alter table product_components drop column if exists job_alternatives;
