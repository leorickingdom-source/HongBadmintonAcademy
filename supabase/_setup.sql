-- HBA combined setup — paste into Supabase SQL Editor and Run (order matters)

-- ===== 0001_schema.sql =====
-- ============================================================================
-- Hong Badminton Academy â€” Core schema (all 6 modules)
-- 0001_schema.sql : extensions, enums, tables, indexes
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "moddatetime";    -- updated_at trigger helper

-- â”€â”€â”€ Enums â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
do $$ begin
  create type user_role         as enum ('admin', 'coach', 'parent');
  create type student_status     as enum ('active', 'inactive');
  create type session_status     as enum ('scheduled', 'in_progress', 'completed', 'canceled');
  create type attendance_status  as enum ('present', 'late', 'absent', 'excused');
  create type fee_interval       as enum ('monthly', 'one_time');
  create type invoice_status     as enum ('draft', 'unpaid', 'paid', 'overdue', 'canceled', 'refunded');
  create type payment_status     as enum ('pending', 'succeeded', 'failed', 'refunded');
  create type message_type       as enum ('scorecard', 'payment_reminder', 'custom');
  create type message_status     as enum ('queued', 'sent', 'delivered', 'read', 'failed');
  create type scorecard_status   as enum ('draft', 'generated', 'sent');
exception when duplicate_object then null; end $$;

-- â”€â”€â”€ Module 5: Identity / RBAC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- One row per auth.users row. Role drives RBAC + RLS.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role   not null default 'parent',
  full_name   text,
  email       text,
  phone       text,                       -- E.164 (e.g. +60123456789) for WhatsApp
  avatar_url  text,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- â”€â”€â”€ Students â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  full_name   text   not null,
  dob         date,
  gender      text,
  parent_id   uuid references public.profiles(id) on delete set null,
  nfc_tag_uid text unique,                -- bound NFC tag (Module 1)
  status      student_status not null default 'active',
  photo_url   text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_students_parent on public.students(parent_id);
create index if not exists idx_students_nfc    on public.students(nfc_tag_uid);

-- â”€â”€â”€ Classes / schedules / enrolment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.classes (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  level            text,
  description      text,
  coach_id         uuid references public.profiles(id) on delete set null, -- primary coach
  default_location text,
  capacity         int,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Multi-coach support (Module 2)
create table if not exists public.class_coaches (
  class_id uuid not null references public.classes(id)  on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  primary key (class_id, coach_id)
);

-- Recurring weekly schedule template
create table if not exists public.class_schedules (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes(id) on delete cascade,
  day_of_week   smallint not null check (day_of_week between 0 and 6), -- 0=Sun
  start_time    time not null,
  end_time      time not null,
  location      text,
  grace_minutes int not null default 15,  -- lateness threshold (Module 1)
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists idx_schedules_class on public.class_schedules(class_id);

create table if not exists public.enrollments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  class_id    uuid not null references public.classes(id)  on delete cascade,
  active      boolean not null default true,
  enrolled_at timestamptz not null default now(),
  unique (student_id, class_id)
);
create index if not exists idx_enrollments_class   on public.enrollments(class_id);
create index if not exists idx_enrollments_student on public.enrollments(student_id);

-- Actual session occurrences
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes(id) on delete cascade,
  schedule_id   uuid references public.class_schedules(id) on delete set null,
  session_date  date not null,
  start_time    time not null,
  end_time      time not null,
  location      text,
  status        session_status not null default 'scheduled',
  grace_minutes int not null default 15,
  created_at    timestamptz not null default now(),
  unique (class_id, session_date, start_time)
);
create index if not exists idx_sessions_date  on public.sessions(session_date);
create index if not exists idx_sessions_class on public.sessions(class_id);

-- â”€â”€â”€ Module 1: Attendance (NFC) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  status      attendance_status not null default 'present',
  tap_in_at   timestamptz,
  tap_out_at  timestamptz,
  tap_in_tag  text,
  flagged     boolean not null default false,  -- auto-flag late/absent
  flag_reason text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (session_id, student_id)
);
create index if not exists idx_attendance_session on public.attendance(session_id);
create index if not exists idx_attendance_student on public.attendance(student_id);

-- Raw NFC tap log (audit + resolution layer)
create table if not exists public.nfc_tap_events (
  id         uuid primary key default gen_random_uuid(),
  tag_uid    text not null,
  reader_id  text,
  class_id   uuid references public.classes(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  tap_type   text,                  -- 'in' | 'out' | 'auto'
  raw        jsonb,
  processed  boolean not null default false,
  error      text,
  tapped_at  timestamptz not null default now()
);
create index if not exists idx_tap_events_tag on public.nfc_tap_events(tag_uid);

-- â”€â”€â”€ Module 2: Coach marking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.marking_schemes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.marking_criteria (
  id          uuid primary key default gen_random_uuid(),
  scheme_id   uuid not null references public.marking_schemes(id) on delete cascade,
  name        text not null,
  description text,
  weight      numeric(6,2) not null default 1,   -- client-provided weighting
  max_score   numeric(6,2) not null default 10,
  sort_order  int not null default 0
);
create index if not exists idx_criteria_scheme on public.marking_criteria(scheme_id);

create table if not exists public.assessments (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,
  coach_id      uuid references public.profiles(id) on delete set null,
  session_id    uuid references public.sessions(id) on delete set null,
  scheme_id     uuid references public.marking_schemes(id) on delete set null,
  assessed_on   date not null default current_date,
  overall_score numeric(6,2),             -- weighted %, computed on save
  comment       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_assessments_student on public.assessments(student_id);
create index if not exists idx_assessments_coach   on public.assessments(coach_id);

create table if not exists public.assessment_scores (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references public.assessments(id) on delete cascade,
  criterion_id   uuid references public.marking_criteria(id) on delete set null,
  criterion_name text not null,           -- snapshot (scheme may change later)
  weight         numeric(6,2) not null default 1,
  max_score      numeric(6,2) not null default 10,
  score          numeric(6,2) not null,
  unique (assessment_id, criterion_id)
);

create table if not exists public.session_notes (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  coach_id   uuid references public.profiles(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  note       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_notes_student on public.session_notes(student_id);

-- â”€â”€â”€ Module 4: Payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.fee_plans (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  amount      numeric(10,2) not null,
  currency    text not null default 'MYR',
  interval    fee_interval not null default 'monthly',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create sequence if not exists invoice_no_seq start 1000;

create table if not exists public.invoices (
  id                        uuid primary key default gen_random_uuid(),
  invoice_no                text unique,
  student_id                uuid references public.students(id) on delete set null,
  parent_id                 uuid references public.profiles(id) on delete set null,
  fee_plan_id               uuid references public.fee_plans(id) on delete set null,
  description               text,
  amount                    numeric(10,2) not null,
  currency                  text not null default 'MYR',
  period_month              date,         -- first day of billed month
  due_date                  date,
  status                    invoice_status not null default 'unpaid',
  stripe_checkout_session_id text,
  stripe_payment_intent_id   text,
  paid_at                   timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists idx_invoices_parent  on public.invoices(parent_id);
create index if not exists idx_invoices_student on public.invoices(student_id);
create index if not exists idx_invoices_status  on public.invoices(status);

-- Transaction / reconciliation log (Module 4)
create table if not exists public.payments (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid references public.invoices(id) on delete set null,
  amount           numeric(10,2) not null,
  currency         text not null default 'MYR',
  provider         text not null default 'stripe',
  provider_txn_id  text,
  provider_event_id text,                 -- webhook event id (idempotency)
  status           payment_status not null default 'pending',
  method           text,
  raw              jsonb,
  created_at       timestamptz not null default now()
);
create unique index if not exists uq_payments_event
  on public.payments(provider, provider_event_id)
  where provider_event_id is not null;

-- â”€â”€â”€ Module 3: Scorecards + WhatsApp â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.scorecards (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  period_month date not null,             -- first day of month
  summary      jsonb,                     -- aggregated scores/attendance/rewards
  pdf_url      text,
  status       scorecard_status not null default 'draft',
  generated_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (student_id, period_month)
);

-- WhatsApp message log + delivery status
create table if not exists public.messages (
  id                  uuid primary key default gen_random_uuid(),
  type                message_type not null,
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  recipient_phone     text not null,
  template_name       text,
  body                text,
  variables           jsonb,
  scorecard_id        uuid references public.scorecards(id) on delete set null,
  invoice_id          uuid references public.invoices(id) on delete set null,
  status              message_status not null default 'queued',
  provider            text not null default 'meta_cloud',
  provider_message_id text,
  error               text,
  queued_at           timestamptz not null default now(),
  sent_at             timestamptz,
  delivered_at        timestamptz,
  read_at             timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists idx_messages_status    on public.messages(status);
create index if not exists idx_messages_recipient on public.messages(recipient_profile_id);

-- â”€â”€â”€ Module 5: Reward system (logic provided by client) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.reward_rules (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  config      jsonb,                      -- client-defined conditions
  points      int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.reward_ledger (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  rule_id    uuid references public.reward_rules(id) on delete set null,
  points     int not null,
  reason     text,
  awarded_by uuid references public.profiles(id) on delete set null,
  awarded_at timestamptz not null default now()
);
create index if not exists idx_reward_ledger_student on public.reward_ledger(student_id);


-- ===== 0002_functions_triggers.sql =====
-- ============================================================================
-- 0002_functions_triggers.sql : updated_at, new-user hook, invoice no,
--                               RBAC helpers, attendance flagging
-- ============================================================================

-- â”€â”€â”€ updated_at maintenance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ New auth user â†’ profile row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ Invoice number â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ RBAC helpers (SECURITY DEFINER â†’ bypass RLS, no recursion) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ Attendance flagging (Module 1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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


-- ===== 0003_rls.sql =====
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

-- â”€â”€â”€ profiles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy profiles_insert on public.profiles for insert to authenticated
  with check (public.is_admin());
create policy profiles_delete on public.profiles for delete to authenticated
  using (public.is_admin());

-- â”€â”€â”€ students â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create policy students_select on public.students for select to authenticated
  using (public.is_admin() or public.parent_of_student(id) or public.coach_of_student(id));
create policy students_write on public.students for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- â”€â”€â”€ classes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create policy classes_select on public.classes for select to authenticated
  using (
    public.is_admin()
    or public.coach_of_class(id)
    or exists (select 1 from public.enrollments e join public.students s on s.id = e.student_id
               where e.class_id = classes.id and s.parent_id = auth.uid())
  );
create policy classes_write on public.classes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- â”€â”€â”€ class_coaches â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create policy class_coaches_select on public.class_coaches for select to authenticated
  using (public.is_admin() or coach_id = auth.uid());
create policy class_coaches_write on public.class_coaches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- â”€â”€â”€ class_schedules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create policy schedules_select on public.class_schedules for select to authenticated
  using (
    public.is_admin()
    or public.coach_of_class(class_id)
    or exists (select 1 from public.enrollments e join public.students s on s.id = e.student_id
               where e.class_id = class_schedules.class_id and s.parent_id = auth.uid())
  );
create policy schedules_write on public.class_schedules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- â”€â”€â”€ enrollments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create policy enrollments_select on public.enrollments for select to authenticated
  using (public.is_admin() or public.coach_of_class(class_id) or public.parent_of_student(student_id));
create policy enrollments_write on public.enrollments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- â”€â”€â”€ sessions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ attendance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create policy attendance_select on public.attendance for select to authenticated
  using (public.is_admin() or public.coach_of_student(student_id) or public.parent_of_student(student_id));
create policy attendance_write on public.attendance for all to authenticated
  using (public.is_admin() or public.coach_of_student(student_id))
  with check (public.is_admin() or public.coach_of_student(student_id));

-- â”€â”€â”€ nfc_tap_events (admin read; writes via service role) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create policy tap_events_select on public.nfc_tap_events for select to authenticated
  using (public.is_admin());

-- â”€â”€â”€ marking schemes / criteria â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create policy schemes_select on public.marking_schemes for select to authenticated
  using (public.is_admin() or public.app_role() = 'coach');
create policy schemes_write on public.marking_schemes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy criteria_select on public.marking_criteria for select to authenticated
  using (public.is_admin() or public.app_role() = 'coach');
create policy criteria_write on public.marking_criteria for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- â”€â”€â”€ assessments + scores â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ session notes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ fee plans (any authenticated may read; admin writes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create policy fee_plans_select on public.fee_plans for select to authenticated using (true);
create policy fee_plans_write on public.fee_plans for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- â”€â”€â”€ invoices + payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create policy invoices_select on public.invoices for select to authenticated
  using (public.is_admin() or parent_id = auth.uid());
create policy invoices_write on public.invoices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy payments_select on public.payments for select to authenticated
  using (public.is_admin() or exists (select 1 from public.invoices i
         where i.id = invoice_id and i.parent_id = auth.uid()));
create policy payments_write on public.payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- â”€â”€â”€ scorecards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create policy scorecards_select on public.scorecards for select to authenticated
  using (public.is_admin() or public.parent_of_student(student_id) or public.coach_of_student(student_id));
create policy scorecards_write on public.scorecards for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- â”€â”€â”€ messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create policy messages_select on public.messages for select to authenticated
  using (public.is_admin() or recipient_profile_id = auth.uid());
create policy messages_write on public.messages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- â”€â”€â”€ rewards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create policy reward_rules_select on public.reward_rules for select to authenticated
  using (public.is_admin() or public.app_role() = 'coach');
create policy reward_rules_write on public.reward_rules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy reward_ledger_select on public.reward_ledger for select to authenticated
  using (public.is_admin() or public.parent_of_student(student_id) or public.coach_of_student(student_id));
create policy reward_ledger_write on public.reward_ledger for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ===== 0004_storage.sql =====
-- ============================================================================
-- 0004_storage.sql : storage buckets
--   avatars         (public)  â€” profile pictures
--   student-photos  (public)  â€” student photos
--   scorecards      (private) â€” monthly PDF score cards; served via signed URLs
-- Uploads are performed server-side with the service role, so object-level
-- policies are intentionally minimal.
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('avatars',        'avatars',        true),
  ('student-photos', 'student-photos', true),
  ('scorecards',     'scorecards',     false)
on conflict (id) do nothing;

-- Admins may manage objects in any HBA bucket through their session, too.
create policy "hba admin objects"
  on storage.objects for all to authenticated
  using (bucket_id in ('avatars','student-photos','scorecards') and public.is_admin())
  with check (bucket_id in ('avatars','student-photos','scorecards') and public.is_admin());

