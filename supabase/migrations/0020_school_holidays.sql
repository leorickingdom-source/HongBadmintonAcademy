-- Academy/school holiday ranges (no classes on these days). Shown on the
-- schedule calendars and skipped when generating sessions. Malaysian *public*
-- holidays are a built-in app list (src/lib/holidays.ts), not stored here.
create table if not exists public.school_holidays (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  start_date date not null,
  end_date   date not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_school_holidays_range on public.school_holidays(start_date, end_date);

alter table public.school_holidays enable row level security;

-- Everyone signed in can read (parents/coaches see them on the schedule);
-- only admins manage. Service role (session generation cron) bypasses RLS.
drop policy if exists school_holidays_read on public.school_holidays;
create policy school_holidays_read on public.school_holidays
  for select using (auth.role() = 'authenticated');

drop policy if exists school_holidays_admin on public.school_holidays;
create policy school_holidays_admin on public.school_holidays
  for all using (public.is_admin()) with check (public.is_admin());
