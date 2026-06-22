-- ============================================================================
-- 0026_notifications.sql : in-app notification bell (admin / coach / parent)
--   + per-user mute toggle. Inserts happen via the service-role client only.
-- ============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_profile_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (recipient_profile_id) where read_at is null;

alter table public.notifications enable row level security;

-- Staff (admin/coach) read + mark-read their own rows via Supabase auth.
-- Parents have no Supabase session and go through the service-role client
-- (RLS bypassed), always filtered by their cookie-resolved profile id in app
-- code. Inserts are service-role only (no insert policy → service role bypasses).
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_profile_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_profile_id = auth.uid())
  with check (recipient_profile_id = auth.uid());

-- Per-user mute switch (single on/off). Default = receive notifications.
alter table public.profiles
  add column if not exists notifications_muted boolean not null default false;
