-- Per-coach pay rate (RM per lesson). Drives the auto-calculated payroll on
-- /admin/coaches/summary (payroll = lessons taught that month × this rate).
alter table public.profiles
  add column if not exists pay_per_lesson numeric not null default 100;
