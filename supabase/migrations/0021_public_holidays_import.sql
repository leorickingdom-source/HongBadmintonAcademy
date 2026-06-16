-- Imported public holidays (admin uploads CSV/XLSX). When present these MERGE
-- with the built-in list in src/lib/holidays.ts (DB rows win on a given date).
-- Used for calendars + skipped in session generation, same as school holidays.
create table if not exists public.public_holidays (
  holiday_date date primary key,
  name         text not null,
  created_at   timestamptz not null default now()
);

alter table public.public_holidays enable row level security;

drop policy if exists public_holidays_read on public.public_holidays;
create policy public_holidays_read on public.public_holidays
  for select using (auth.role() = 'authenticated');

drop policy if exists public_holidays_admin on public.public_holidays;
create policy public_holidays_admin on public.public_holidays
  for all using (public.is_admin()) with check (public.is_admin());
