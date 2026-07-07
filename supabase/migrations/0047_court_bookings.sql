-- ============================================================================
-- 0047_court_bookings.sql : Court booking (Phase #3, revenue side).
--
-- Club members book a court for a date + time; price = court.hourly_rate ×
-- hours. A booking raises a business='club' invoice → Stripe checkout; the
-- webhook confirms the booking when paid. Reuses the existing `courts` table
-- (name, hourly_rate, active). Super-admin managed; members act via their
-- signed portal token (service-role).
-- ============================================================================

create table if not exists public.court_bookings (
  id             uuid primary key default gen_random_uuid(),
  court_id       uuid not null references public.courts(id) on delete cascade,
  branch_id      uuid references public.branches(id) on delete set null,
  club_member_id uuid references public.club_members(id) on delete set null,
  booking_date   date not null,
  start_time     time not null,
  end_time       time not null,
  hours          numeric(5,2) not null,
  amount         numeric(10,2) not null,
  currency       text not null default 'MYR',
  status         text not null default 'pending',
  invoice_id     uuid references public.invoices(id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint court_bookings_status_chk check (status in ('pending','confirmed','canceled')),
  constraint court_bookings_time_chk check (end_time > start_time)
);
create index if not exists court_bookings_court_date_idx on public.court_bookings(court_id, booking_date);
create index if not exists court_bookings_member_idx on public.court_bookings(club_member_id);
-- Block two live bookings starting at the same court/date/time (a cheap guard;
-- fuller overlap protection is app-side in the booking action).
create unique index if not exists uq_court_bookings_slot
  on public.court_bookings(court_id, booking_date, start_time)
  where status <> 'canceled';

alter table public.court_bookings enable row level security;
create policy court_bookings_super_all on public.court_bookings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
