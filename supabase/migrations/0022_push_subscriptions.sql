-- Web Push (PWA) subscriptions. One row per browser-install per user — a single
-- user can have many subscriptions (phone PWA, desktop Chrome, tablet).
-- endpoint is the unique handle the push service hands us; if it 410-Gones at
-- send time we delete the row.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists idx_push_subs_user on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

-- A user reads + manages only their own subs. Service role bypasses RLS for
-- server-side sends.
drop policy if exists push_subs_self_read on push_subscriptions;
create policy push_subs_self_read
  on push_subscriptions for select
  using (user_id = auth.uid());

drop policy if exists push_subs_self_insert on push_subscriptions;
create policy push_subs_self_insert
  on push_subscriptions for insert
  with check (user_id = auth.uid());

drop policy if exists push_subs_self_delete on push_subscriptions;
create policy push_subs_self_delete
  on push_subscriptions for delete
  using (user_id = auth.uid());
