-- ============================================================================
-- 0008_weekly_marks.sql : lightweight weekly coach mark (Module 2 add-on)
-- Monthly `assessments` stay the formal score card; this is a quick 1–5 weekly
-- check-in per student so coaches can track progress between months.
-- ============================================================================

create table if not exists public.weekly_marks (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id)  on delete cascade,
  coach_id    uuid references public.profiles(id) on delete set null,
  week_start  date not null,                       -- Monday of the marked week (MYT)
  rating      smallint not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (student_id, week_start)                  -- one mark per student per week (upsert)
);
create index if not exists idx_weekly_marks_student on public.weekly_marks(student_id);
create index if not exists idx_weekly_marks_coach   on public.weekly_marks(coach_id);

drop trigger if exists weekly_marks_set_updated_at on public.weekly_marks;
create trigger weekly_marks_set_updated_at
  before update on public.weekly_marks
  for each row execute procedure moddatetime(updated_at);

-- ─── RLS (mirrors assessments) ───────────────────────────────────────────────
alter table public.weekly_marks enable row level security;

create policy weekly_marks_select on public.weekly_marks for select to authenticated
  using (public.is_admin() or coach_id = auth.uid()
         or public.coach_of_student(student_id) or public.parent_of_student(student_id));

create policy weekly_marks_insert on public.weekly_marks for insert to authenticated
  with check (public.is_admin() or (public.app_role() = 'coach' and public.coach_of_student(student_id)));

create policy weekly_marks_update on public.weekly_marks for update to authenticated
  using (public.is_admin() or coach_id = auth.uid() or public.coach_of_student(student_id))
  with check (public.is_admin() or coach_id = auth.uid() or public.coach_of_student(student_id));

create policy weekly_marks_delete on public.weekly_marks for delete to authenticated
  using (public.is_admin() or coach_id = auth.uid());
