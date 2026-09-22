-- ============================================================================
-- Purchase orders: receiving, a quantities-only mode, and letterhead
--
-- Three things an order could not do, all of which it needs before a PDF of it
-- can be sent to a supplier and the goods booked in when they arrive.
-- ============================================================================


-- ------------------------------------------------- receiving, line by line --
-- An order arriving in one piece is the exception. Marking the whole order
-- 'received' was the only option, which is a lie whenever three of five lines
-- turn up: the two outstanding ones vanish from view and the stock that did
-- arrive has to be typed in by hand on the Stock page.
--
-- So how much of each line has actually landed is recorded ON the line. The
-- order stays open showing what is still owed, and the rest is received when
-- it arrives.
--
-- numeric, not integer: a line is counted in ORDER units — packs and bars —
-- and while those are whole today, half a bar is not unthinkable and the
-- ordered quantity beside it is already numeric.
alter table purchase_order_lines add column if not exists qty_received numeric not null default 0;

-- Lines on orders already marked received are treated as fully received, or
-- every historical order would reopen showing everything outstanding.
update purchase_order_lines l
   set qty_received = l.qty_ordered
  from purchase_orders p
 where p.id = l.po_id
   and p.status = 'received'
   and l.qty_received = 0;

create index if not exists purchase_order_lines_outstanding_idx
  on purchase_order_lines(po_id)
  where qty_received < qty_ordered;


-- --------------------------------------------------- quantities-only mode --
-- Whether this order shows money at all. Saved on the ORDER rather than held
-- as a screen toggle, so the sheet someone opens next month is the sheet that
-- was sent — and the PDF cannot disagree with what is on screen.
alter table purchase_orders add column if not exists hide_pricing boolean not null default false;


-- ---------------------------------------------------------- our own details --
-- A purchase order is the first document this app sends OUT, to someone who
-- is not us, so it is the first one that has to say who we are and where to
-- deliver. Nothing held that.
--
-- Its own table rather than a key in `settings`: that table already exists in
-- this database and belongs to the leads app (sources, warmth, team_members),
-- and quietly adding keys to another application's configuration is how you
-- break something you cannot see.
--
-- One row, pinned by a check constraint, so there is no question which is
-- current and no way to end up with two.
create table if not exists company_details (
  id          integer primary key default 1 check (id = 1),
  name        text not null default 'Curtain Ideas',
  abn         text,
  address     text,          -- free text; printed as typed, line breaks kept
  phone       text,
  email       text,
  website     text,
  delivery_address text,     -- where suppliers actually deliver, when it
                             -- differs from the postal address
  delivery_note    text,     -- "Deliveries 7am-3pm, rear roller door"
  updated_at  timestamptz not null default now()
);

insert into company_details (id) values (1) on conflict (id) do nothing;


-- ============================================================================
-- VERIFY
-- ============================================================================
-- select p.status, count(*) filter (where l.qty_received >= l.qty_ordered) as done,
--        count(*) as lines
--   from purchase_orders p join purchase_order_lines l on l.po_id = p.id
--  group by p.status;
--   -- expect every line on a 'received' order to be done
--
-- select * from company_details;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- drop table if exists company_details;
-- alter table purchase_orders drop column if exists hide_pricing;
-- drop index if exists purchase_order_lines_outstanding_idx;
-- alter table purchase_order_lines drop column if exists qty_received;
