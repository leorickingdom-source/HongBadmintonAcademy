-- ============================================================================
-- Hong Badminton Academy — Core schema (all 6 modules)
-- 0001_schema.sql : extensions, enums, tables, indexes
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "moddatetime";    -- updated_at trigger helper

-- ─── Enums ──────────────────────────────────────────────────────────────────
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

-- ─── Module 5: Identity / RBAC ──────────────────────────────────────────────
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

-- ─── Students ───────────────────────────────────────────────────────────────
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

-- ─── Classes / schedules / enrolment ────────────────────────────────────────
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

-- ─── Module 1: Attendance (NFC) ─────────────────────────────────────────────
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

-- ─── Module 2: Coach marking ────────────────────────────────────────────────
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

-- ─── Module 4: Payments ─────────────────────────────────────────────────────
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

-- ─── Module 3: Scorecards + WhatsApp ────────────────────────────────────────
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

-- ─── Module 5: Reward system (logic provided by client) ─────────────────────
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
