-- ============================================================================
-- 0036_monthly_assessments.sql
-- Monthly class assessment — the revived "monthly report" source, fully separate
-- from promotion exams (level_exams). Coach grades the whole class roster once a
-- month on 3 simple dimensions (1-5) + an optional comment per student.
-- ============================================================================
create table if not exists public.monthly_assessments (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  class_id     uuid references public.classes(id) on delete set null,
  coach_id     uuid references public.profiles(id) on delete set null,
  period_month date not null,                    -- first day of the month
  fitness      smallint check (fitness between 1 and 5),
  skills       smallint check (skills between 1 and 5),
  attitude     smallint check (attitude between 1 and 5),
  comment      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (student_id, period_month)
);
create index if not exists idx_monthly_assess_student on public.monthly_assessments(student_id);
create index if not exists idx_monthly_assess_period  on public.monthly_assessments(period_month);

drop trigger if exists set_updated_at on public.monthly_assessments;
create trigger set_updated_at before update on public.monthly_assessments
  for each row execute function moddatetime(updated_at);

alter table public.monthly_assessments enable row level security;

drop policy if exists monthly_assess_select on public.monthly_assessments;
create policy monthly_assess_select on public.monthly_assessments for select to authenticated
  using (public.is_admin() or coach_id = auth.uid()
         or public.coach_of_student(student_id) or public.parent_of_student(student_id));

drop policy if exists monthly_assess_write on public.monthly_assessments;
create policy monthly_assess_write on public.monthly_assessments for all to authenticated
  using (public.is_admin() or public.coach_of_student(student_id))
  with check (public.is_admin() or public.coach_of_student(student_id));
