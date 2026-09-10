-- What kind of order this is, as declared by whoever submitted it
--
-- The ops screens already work out whether a job holds tracks or blinds by
-- looking at its windows (see productTypesIn), which is accurate but only
-- once the windows exist. A job that has just arrived from the portal has
-- none, so it reads as neither, and the person picking it up cannot tell
-- what they are about to build without opening the PDF.
--
-- So the submitter says. This is a DECLARATION, not a derivation: it is what
-- the order was sent in as, and it stays true even after windows are added.
-- Where the two disagree the windows win for anything costed — nothing reads
-- this to decide what to build — but the disagreement is itself worth seeing.
--
-- Named product_type to match products.product_type, which already holds
-- exactly these values and means the same thing. Deliberately NOT order_type:
-- components.order_type already means how a part is bought (pack/bar/fabric/
-- labour), and a second meaning of that name would be a trap.

alter table mfg_jobs add column if not exists product_type text;

do $$ begin
  alter table mfg_jobs drop constraint if exists mfg_jobs_product_type_check;
  alter table mfg_jobs add constraint mfg_jobs_product_type_check
    check (product_type is null or product_type in ('track', 'blind'));
exception when undefined_object then null; end $$;

-- Left NULL on every existing job rather than guessed from its windows. A job
-- with both kinds on it has no single answer, and inventing one would make the
-- column look authoritative when it is only ever what someone typed.

-- ============================================================================
-- VERIFY
-- ============================================================================
-- select product_type, count(*) from mfg_jobs group by 1 order by 1;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- alter table mfg_jobs drop constraint if exists mfg_jobs_product_type_check;
-- alter table mfg_jobs drop column if exists product_type;
