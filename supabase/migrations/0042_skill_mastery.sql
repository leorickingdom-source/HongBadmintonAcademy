-- Per-skill mastery (Kumon-style): a coach ticks off the curriculum skills a
-- student has mastered at their current level. Presence of a row = mastered
-- (unticking deletes it), so a simple row count is the "X of Y mastered" number.
-- skill_key = "<groupIndex>.<itemIndex>" within that level's TRAINING_LEVELS
-- curriculum. RLS mirrors monthly_assessments (admin all, coach of the student).

create table if not exists public.skill_mastery (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  level      smallint not null,
  skill_key  text not null,
  coach_id   uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (student_id, level, skill_key)
);

create index if not exists skill_mastery_student_idx on public.skill_mastery (student_id, level);

alter table public.skill_mastery enable row level security;

create policy skill_mastery_read on public.skill_mastery for select to authenticated
  using (public.is_admin() or public.coach_of_student(student_id));
create policy skill_mastery_write on public.skill_mastery for all to authenticated
  using (public.is_admin() or public.coach_of_student(student_id))
  with check (public.is_admin() or public.coach_of_student(student_id));
