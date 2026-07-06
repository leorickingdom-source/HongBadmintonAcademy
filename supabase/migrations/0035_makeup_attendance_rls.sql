-- ============================================================================
-- 0035_makeup_attendance_rls.sql
-- A coach must be able to mark attendance + rate a MAKEUP student sitting in on
-- their session, even though that student isn't enrolled in their class. True
-- when an approved leave books the student into this session and the caller
-- coaches that session's class.
-- ============================================================================
create or replace function public.coach_of_makeup(p_student uuid, p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.leave_requests lr
    join public.sessions s on s.id = lr.makeup_session_id
    where lr.student_id = p_student
      and lr.makeup_session_id = p_session
      and lr.status = 'approved'
      and public.coach_of_class(s.class_id)
  );
$$;

drop policy if exists attendance_write on public.attendance;
create policy attendance_write on public.attendance for all to authenticated
  using (public.is_admin() or public.coach_of_student(student_id)
         or public.coach_of_makeup(student_id, session_id))
  with check (public.is_admin() or public.coach_of_student(student_id)
              or public.coach_of_makeup(student_id, session_id));

drop policy if exists session_marks_insert on public.session_marks;
create policy session_marks_insert on public.session_marks for insert to authenticated
  with check (public.is_admin()
              or (public.app_role() = 'coach'
                  and (public.coach_of_student(student_id) or public.coach_of_makeup(student_id, session_id))));

drop policy if exists session_marks_update on public.session_marks;
create policy session_marks_update on public.session_marks for update to authenticated
  using (public.is_admin() or coach_id = auth.uid()
         or public.coach_of_student(student_id) or public.coach_of_makeup(student_id, session_id))
  with check (public.is_admin() or coach_id = auth.uid()
              or public.coach_of_student(student_id) or public.coach_of_makeup(student_id, session_id));
