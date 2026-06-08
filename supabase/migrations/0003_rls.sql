-- ============================================================================
-- 0003_rls.sql : Row Level Security. Service role bypasses all of this
-- (used by NFC ingest, Stripe webhook, cron, scorecard/message workers).
-- ============================================================================

alter table public.profiles         enable row level security;
alter table public.students         enable row level security;
alter table public.classes          enable row level security;
alter table public.class_coaches    enable row level security;
alter table public.class_schedules  enable row level security;
alter table public.enrollments      enable row level security;
alter table public.sessions         enable row level security;
alter table public.attendance       enable row level security;
alter table public.nfc_tap_events   enable row level security;
alter table public.marking_schemes  enable row level security;
alter table public.marking_criteria enable row level security;
alter table public.assessments      enable row level security;
alter table public.assessment_scores enable row level security;
alter table public.session_notes    enable row level security;
alter table public.fee_plans        enable row level security;
alter table public.invoices         enable row level security;
alter table public.payments         enable row level security;
alter table public.scorecards       enable row level security;
alter table public.messages         enable row level security;
alter table public.reward_rules     enable row level security;
alter table public.reward_ledger    enable row level security;

-- ─── profiles ───────────────────────────────────────────────────────────────
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy profiles_insert on public.profiles for insert to authenticated
  with check (public.is_admin());
create policy profiles_delete on public.profiles for delete to authenticated
  using (public.is_admin());

-- ─── students ───────────────────────────────────────────────────────────────
create policy students_select on public.students for select to authenticated
  using (public.is_admin() or public.parent_of_student(id) or public.coach_of_student(id));
create policy students_write on public.students for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ─── classes ────────────────────────────────────────────────────────────────
create policy classes_select on public.classes for select to authenticated
  using (
    public.is_admin()
    or public.coach_of_class(id)
    or exists (select 1 from public.enrollments e join public.students s on s.id = e.student_id
               where e.class_id = classes.id and s.parent_id = auth.uid())
  );
create policy classes_write on public.classes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ─── class_coaches ──────────────────────────────────────────────────────────
create policy class_coaches_select on public.class_coaches for select to authenticated
  using (public.is_admin() or coach_id = auth.uid());
create policy class_coaches_write on public.class_coaches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ─── class_schedules ────────────────────────────────────────────────────────
create policy schedules_select on public.class_schedules for select to authenticated
  using (
    public.is_admin()
    or public.coach_of_class(class_id)
    or exists (select 1 from public.enrollments e join public.students s on s.id = e.student_id
               where e.class_id = class_schedules.class_id and s.parent_id = auth.uid())
  );
create policy schedules_write on public.class_schedules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ─── enrollments ────────────────────────────────────────────────────────────
create policy enrollments_select on public.enrollments for select to authenticated
  using (public.is_admin() or public.coach_of_class(class_id) or public.parent_of_student(student_id));
create policy enrollments_write on public.enrollments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ─── sessions ───────────────────────────────────────────────────────────────
create policy sessions_select on public.sessions for select to authenticated
  using (
    public.is_admin()
    or public.coach_of_class(class_id)
    or exists (select 1 from public.enrollments e join public.students s on s.id = e.student_id
               where e.class_id = sessions.class_id and s.parent_id = auth.uid())
  );
create policy sessions_write on public.sessions for all to authenticated
  using (public.is_admin() or public.coach_of_class(class_id))
  with check (public.is_admin() or public.coach_of_class(class_id));

-- ─── attendance ─────────────────────────────────────────────────────────────
create policy attendance_select on public.attendance for select to authenticated
  using (public.is_admin() or public.coach_of_student(student_id) or public.parent_of_student(student_id));
create policy attendance_write on public.attendance for all to authenticated
  using (public.is_admin() or public.coach_of_student(student_id))
  with check (public.is_admin() or public.coach_of_student(student_id));

-- ─── nfc_tap_events (admin read; writes via service role) ────────────────────
create policy tap_events_select on public.nfc_tap_events for select to authenticated
  using (public.is_admin());

-- ─── marking schemes / criteria ─────────────────────────────────────────────
create policy schemes_select on public.marking_schemes for select to authenticated
  using (public.is_admin() or public.app_role() = 'coach');
create policy schemes_write on public.marking_schemes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy criteria_select on public.marking_criteria for select to authenticated
  using (public.is_admin() or public.app_role() = 'coach');
create policy criteria_write on public.marking_criteria for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ─── assessments + scores ───────────────────────────────────────────────────
create policy assessments_select on public.assessments for select to authenticated
  using (public.is_admin() or coach_id = auth.uid()
         or public.coach_of_student(student_id) or public.parent_of_student(student_id));
create policy assessments_insert on public.assessments for insert to authenticated
  with check (public.is_admin() or (public.app_role() = 'coach' and public.coach_of_student(student_id)));
create policy assessments_update on public.assessments for update to authenticated
  using (public.is_admin() or coach_id = auth.uid())
  with check (public.is_admin() or coach_id = auth.uid());
create policy assessments_delete on public.assessments for delete to authenticated
  using (public.is_admin() or coach_id = auth.uid());

create policy scores_select on public.assessment_scores for select to authenticated
  using (exists (select 1 from public.assessments a where a.id = assessment_id
    and (public.is_admin() or a.coach_id = auth.uid()
         or public.coach_of_student(a.student_id) or public.parent_of_student(a.student_id))));
create policy scores_write on public.assessment_scores for all to authenticated
  using (exists (select 1 from public.assessments a where a.id = assessment_id
    and (public.is_admin() or a.coach_id = auth.uid())))
  with check (exists (select 1 from public.assessments a where a.id = assessment_id
    and (public.is_admin() or a.coach_id = auth.uid())));

-- ─── session notes ──────────────────────────────────────────────────────────
create policy notes_select on public.session_notes for select to authenticated
  using (public.is_admin() or coach_id = auth.uid()
         or public.coach_of_student(student_id) or public.parent_of_student(student_id));
create policy notes_insert on public.session_notes for insert to authenticated
  with check (public.is_admin() or (public.app_role() = 'coach' and public.coach_of_student(student_id)));
create policy notes_modify on public.session_notes for update to authenticated
  using (public.is_admin() or coach_id = auth.uid())
  with check (public.is_admin() or coach_id = auth.uid());
create policy notes_delete on public.session_notes for delete to authenticated
  using (public.is_admin() or coach_id = auth.uid());

-- ─── fee plans (any authenticated may read; admin writes) ────────────────────
create policy fee_plans_select on public.fee_plans for select to authenticated using (true);
create policy fee_plans_write on public.fee_plans for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ─── invoices + payments ────────────────────────────────────────────────────
create policy invoices_select on public.invoices for select to authenticated
  using (public.is_admin() or parent_id = auth.uid());
create policy invoices_write on public.invoices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy payments_select on public.payments for select to authenticated
  using (public.is_admin() or exists (select 1 from public.invoices i
         where i.id = invoice_id and i.parent_id = auth.uid()));
create policy payments_write on public.payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ─── scorecards ─────────────────────────────────────────────────────────────
create policy scorecards_select on public.scorecards for select to authenticated
  using (public.is_admin() or public.parent_of_student(student_id) or public.coach_of_student(student_id));
create policy scorecards_write on public.scorecards for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ─── messages ───────────────────────────────────────────────────────────────
create policy messages_select on public.messages for select to authenticated
  using (public.is_admin() or recipient_profile_id = auth.uid());
create policy messages_write on public.messages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ─── rewards ────────────────────────────────────────────────────────────────
create policy reward_rules_select on public.reward_rules for select to authenticated
  using (public.is_admin() or public.app_role() = 'coach');
create policy reward_rules_write on public.reward_rules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy reward_ledger_select on public.reward_ledger for select to authenticated
  using (public.is_admin() or public.parent_of_student(student_id) or public.coach_of_student(student_id));
create policy reward_ledger_write on public.reward_ledger for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
