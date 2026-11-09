-- Ask about a KIND on the job, not a recipe line
--
-- Whether a part is one the job gets a say in is a fact about the part, not
-- about any one recipe. Winders are chosen by what is on the shelf that week
-- — that is true of every product that uses a winder, so saying it on each
-- recipe line meant saying it once per product and keeping them in step
-- afterwards. Same reason the group name moved to the component, and the
-- alternatives list stopped being curated per line.
--
--   ask_on_job   when true, any recipe line built from a component of this
--                kind becomes a question when a window is added. The kind's
--                NAME is the question, and its members are the answers.
--
-- product_components.job_role is no longer read. Nothing had it set, so there
-- is nothing to carry across; the column is left in place holding nothing.
--
-- Note what this deliberately gives up: a per-product opt-out. If Winder is
-- asked, it is asked on every product that uses one. That is the point — a
-- kind that is sometimes a question and sometimes not was the thing that made
-- this confusing to set up in the first place. Untick the kind and it stops
-- being asked everywhere at once.

alter table component_kinds add column if not exists ask_on_job boolean not null default false;


-- ============================================================================
-- VERIFY
-- ============================================================================
-- select k.name, k.ask_on_job,
--        (select count(*) from components c where c.kind = k.name) as parts
--   from component_kinds k order by k.sort_order;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- alter table component_kinds drop column if exists ask_on_job;
