-- ============================================================================
-- 0049_trial_leads.sql : Public "book a free trial" funnel (Phase 1).
--
-- Kumon-style, lead-first intake. A prospect submits the public /trial form
-- (no login, no payment) which drops a lead here in status 'new'. Admins work
-- it in /admin/leads along the status ladder; a later phase converts a
-- 'trialed' lead into a real student (fills converted_student_id). The student
-- record is born LAST — after the trial — the inverse of today's admin-only
-- create flow.
--
-- Branch-scoped like students: super-admin sees all, branch-admin sees their
-- own branch (+ null-branch/unassigned leads). Public inserts go through the
-- service-role action (no anon policy); admin updates use the RLS client.
-- ============================================================================

create table if not exists public.trial_leads (
  id                   uuid primary key default gen_random_uuid(),
  branch_id            uuid references public.branches(id) on delete set null,
  child_name           text not null,
  child_dob            date,
  experience           text,                         -- self-report: none / some / experienced
  parent_name          text not null,
  phone                text not null,                -- E.164 (+60…)
  email                text,
  preferred_slot       text,                         -- free-text day/time (no session picker in P1)
  status               text not null default 'new',
  source               text default 'web',
  consent              boolean not null default false,
  consent_at           timestamptz,
  assigned_to          uuid references public.profiles(id) on delete set null,
  notes                text,
  converted_student_id uuid references public.students(id) on delete set null,  -- P2 fills this
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint trial_leads_status_chk
    check (status in ('new','contacted','trial_booked','trialed','enrolled','lost'))
);

create index if not exists trial_leads_status_idx  on public.trial_leads(status);
create index if not exists trial_leads_branch_idx  on public.trial_leads(branch_id);
create index if not exists trial_leads_created_idx on public.trial_leads(created_at desc);

drop trigger if exists set_updated_at on public.trial_leads;
create trigger set_updated_at before update on public.trial_leads
  for each row execute function moddatetime(updated_at);

alter table public.trial_leads enable row level security;

-- Staff only. admin_branch_ok() (from 0031): super-admin → any branch;
-- branch-admin → their own branch, plus null-branch (unassigned) leads.
drop policy if exists trial_leads_admin_all on public.trial_leads;
create policy trial_leads_admin_all on public.trial_leads for all to authenticated
  using (public.admin_branch_ok(branch_id)) with check (public.admin_branch_ok(branch_id));
