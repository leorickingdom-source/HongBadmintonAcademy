-- ============================================================================
-- 0034_leave_and_makeup.sql
-- Parent leave requests on a session, with an optional makeup assignment, plus
-- coach leave requests on their own sessions.
-- ============================================================================

create table if not exists public.leave_requests (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.sessions(id) on delete cascade,
  student_id        uuid not null references public.students(id) on delete cascade,
  parent_id         uuid references public.profiles(id) on delete set null,
  reason            text,
  status            text not null default 'pending' check (status in ('pending','approved','declined')),
  makeup_session_id uuid references public.sessions(id) on delete set null,
  decided_by        uuid references public.profiles(id) on delete set null,
  decided_at        timestamptz,
  created_at        timestamptz not null default now(),
  unique (session_id, student_id)
);
create index if not exists idx_leave_requests_status  on public.leave_requests(status);
create index if not exists idx_leave_requests_student on public.leave_requests(student_id);
create index if not exists idx_leave_requests_makeup  on public.leave_requests(makeup_session_id);

alter table public.leave_requests enable row level security;

-- Admins manage; coaches may read leaves touching their classes (source session
-- or makeup session) so the check-in board can show expected makeup students.
-- Parents go through the service-role path (cookie auth), no policy needed.
drop policy if exists leave_requests_admin on public.leave_requests;
create policy leave_requests_admin on public.leave_requests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists leave_requests_coach_read on public.leave_requests;
create policy leave_requests_coach_read on public.leave_requests for select to authenticated
  using (
    exists (select 1 from public.sessions s where s.id = session_id and public.coach_of_class(s.class_id))
    or exists (select 1 from public.sessions s2 where s2.id = makeup_session_id and public.coach_of_class(s2.class_id))
  );

create table if not exists public.coach_leave_requests (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  reason     text,
  status     text not null default 'pending' check (status in ('pending','approved','declined')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, coach_id)
);
create index if not exists idx_coach_leave_status on public.coach_leave_requests(status);

alter table public.coach_leave_requests enable row level security;

drop policy if exists coach_leave_admin on public.coach_leave_requests;
create policy coach_leave_admin on public.coach_leave_requests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists coach_leave_self_read on public.coach_leave_requests;
create policy coach_leave_self_read on public.coach_leave_requests for select to authenticated
  using (coach_id = auth.uid());
drop policy if exists coach_leave_self_insert on public.coach_leave_requests;
create policy coach_leave_self_insert on public.coach_leave_requests for insert to authenticated
  with check (
    coach_id = auth.uid()
    and exists (select 1 from public.sessions s where s.id = session_id and public.coach_of_class(s.class_id))
  );
drop policy if exists coach_leave_self_delete on public.coach_leave_requests;
create policy coach_leave_self_delete on public.coach_leave_requests for delete to authenticated
  using (public.is_admin() or (coach_id = auth.uid() and status = 'pending'));
