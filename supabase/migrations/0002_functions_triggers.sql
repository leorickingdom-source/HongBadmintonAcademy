-- ============================================================================
-- 0002_functions_triggers.sql : updated_at, new-user hook, invoice no,
--                               RBAC helpers, attendance flagging
-- ============================================================================

-- ─── updated_at maintenance ─────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','students','classes','attendance','marking_schemes',
    'assessments','fee_plans','invoices','scorecards','reward_rules'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function moddatetime(updated_at);', t);
  end loop;
end $$;

-- ─── New auth user → profile row ────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name, email, phone)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'parent'),
    new.raw_user_meta_data ->> 'full_name',
    new.email,
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Invoice number ─────────────────────────────────────────────────────────
create or replace function public.set_invoice_no()
returns trigger language plpgsql as $$
begin
  if new.invoice_no is null then
    new.invoice_no := 'INV-' || to_char(now(), 'YYYYMM') || '-' || nextval('invoice_no_seq');
  end if;
  return new;
end $$;

drop trigger if exists set_invoice_no on public.invoices;
create trigger set_invoice_no before insert on public.invoices
  for each row execute function public.set_invoice_no();

-- ─── RBAC helpers (SECURITY DEFINER → bypass RLS, no recursion) ──────────────
create or replace function public.app_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.parent_of_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student and s.parent_id = auth.uid()
  );
$$;

create or replace function public.coach_of_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes c
                 where c.id = p_class and c.coach_id = auth.uid())
      or exists (select 1 from public.class_coaches cc
                 where cc.class_id = p_class and cc.coach_id = auth.uid());
$$;

create or replace function public.coach_of_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.enrollments e
    where e.student_id = p_student
      and (
        exists (select 1 from public.classes c
                where c.id = e.class_id and c.coach_id = auth.uid())
        or exists (select 1 from public.class_coaches cc
                   where cc.class_id = e.class_id and cc.coach_id = auth.uid())
      )
  );
$$;

-- ─── Attendance flagging (Module 1) ─────────────────────────────────────────
-- For one session: flag late tap-ins, insert absent rows for no-shows.
create or replace function public.process_session_attendance(p_session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s_class uuid;
  s_start timestamptz;
  s_grace int;
begin
  if not (auth.uid() is null or public.is_admin()) then
    raise exception 'not authorized';
  end if;

  select class_id, (session_date + start_time)::timestamptz, grace_minutes
    into s_class, s_start, s_grace
  from public.sessions where id = p_session_id;
  if s_class is null then return; end if;

  -- Late: tapped in after start + grace
  update public.attendance a
     set status = 'late', flagged = true, flag_reason = 'Late tap-in'
   where a.session_id = p_session_id
     and a.tap_in_at is not null
     and a.status not in ('excused')
     and a.tap_in_at > s_start + make_interval(mins => s_grace);

  -- Absent: enrolled + active, but no attendance row
  insert into public.attendance (session_id, student_id, status, flagged, flag_reason)
  select p_session_id, e.student_id, 'absent', true, 'No tap-in recorded'
  from public.enrollments e
  where e.class_id = s_class
    and e.active
    and not exists (
      select 1 from public.attendance a
      where a.session_id = p_session_id and a.student_id = e.student_id
    );
end $$;

-- Sweep finished sessions: flag them + mark completed. Returns count processed.
create or replace function public.flag_due_absences()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not (auth.uid() is null or public.is_admin()) then
    raise exception 'not authorized';
  end if;

  for r in
    select id from public.sessions
    where status in ('scheduled','in_progress')
      and (session_date + end_time)::timestamptz < now()
  loop
    perform public.process_session_attendance(r.id);
    update public.sessions set status = 'completed' where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.flag_due_absences()             from public;
revoke all on function public.process_session_attendance(uuid) from public;
grant execute on function public.flag_due_absences()             to authenticated, service_role;
grant execute on function public.process_session_attendance(uuid) to authenticated, service_role;
