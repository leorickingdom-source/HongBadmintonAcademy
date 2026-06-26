-- ─── Level training & promotion exams ───────────────────────────────────────
-- The academy's 6-level training ladder (Starter → Elite Team) with a scored
-- promotion exam between each level. Source of truth: HBA Training System v2.
-- Each exam is graded on a fixed 100-pt rubric (Technical 40 / Footwork 25 /
-- Game-or-Tactical 20 / Physical-Attitude 15); ≥70 = pass = promote.
--
-- `students.level` (1–6) is the granular training level. The existing coarse
-- `students.rank` (Beginner/Intermediate/Advanced/Elite) is kept in sync from
-- level on promotion (see src/lib/training.ts -> levelToRank) so the leaderboard,
-- badges and fee tiers keep working without a second ladder.

alter table public.students
  add column if not exists level smallint
  check (level is null or (level between 1 and 6));

create table if not exists public.level_exams (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,
  coach_id      uuid references public.profiles(id) on delete set null,
  from_level    smallint not null check (from_level between 1 and 6),
  to_level      smallint not null check (to_level between 1 and 7),
  exam_date     date not null default current_date,
  window_label  text,                                  -- e.g. "Apr 2026"
  technical     numeric not null default 0,            -- section subtotals (/40,/25,/20,/15)
  footwork      numeric not null default 0,
  tactical      numeric not null default 0,
  physical      numeric not null default 0,
  total         numeric not null default 0,            -- /100
  band          text,                                  -- excellent | pass | borderline | fail
  decision      text,                                  -- promote | maintain | reassess
  scores        jsonb,                                 -- self-describing per-item snapshot
  coach_comment text,
  next_target   text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_level_exams_student on public.level_exams(student_id);
create index if not exists idx_level_exams_created on public.level_exams(created_at desc);

-- RLS — mirrors public.assessments: admin full; coaches read all + grade their
-- own students; parents read their child's results. Parent area uses the
-- service-role client (bypasses RLS) but we keep the policy for completeness.
alter table public.level_exams enable row level security;

create policy level_exams_select on public.level_exams for select to authenticated
  using (public.is_admin() or coach_id = auth.uid()
         or public.coach_of_student(student_id) or public.parent_of_student(student_id));

create policy level_exams_insert on public.level_exams for insert to authenticated
  with check (public.is_admin() or (public.app_role() = 'coach' and public.coach_of_student(student_id)));

create policy level_exams_update on public.level_exams for update to authenticated
  using (public.is_admin() or coach_id = auth.uid())
  with check (public.is_admin() or coach_id = auth.uid());

create policy level_exams_delete on public.level_exams for delete to authenticated
  using (public.is_admin() or coach_id = auth.uid());
