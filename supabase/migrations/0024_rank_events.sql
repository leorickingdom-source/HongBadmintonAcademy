-- Rank progression history. Every time a student's rank changes (coach
-- assessment promotion or admin promote/override), we append one row here so
-- the parent app can show a "rank history" timeline and the ladder knows when
-- each tier was reached. Display still derives the CURRENT rank from
-- students.rank + class level (see src/lib/ranks.ts -> studentRank()); this
-- table is the audit/timeline only.
--
-- Written + read exclusively via the service-role client (coach/admin actions
-- and the parent child page already use it), so RLS stays closed with no
-- policies — direct anon/auth access is denied.
create table if not exists public.rank_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  from_rank text,
  to_rank text,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists rank_events_student_idx
  on public.rank_events (student_id, created_at desc);

alter table public.rank_events enable row level security;
