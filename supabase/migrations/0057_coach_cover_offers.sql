-- ============================================================================
-- 0057_coach_cover_offers.sql : Coach-cover "marketplace" on top of 0053.
--
-- 0053 let an admin hand-pick a replacement when approving coach leave. This
-- adds the second path the owner asked for: the admin can instead OPEN the
-- cover to eligible coaches, who tap "I'll cover"; the admin then CONFIRMS one
-- (admin keeps the final gate — no silent auto-assign).
--
--   coach_leave_requests.cover_status:
--     'none'   — approved with no cover / not applicable
--     'open'   — approved, broadcast to coaches, collecting offers
--     'filled' — a replacement is confirmed (replacement_coach_id set)
--
--   coach_cover_offers — one row per coach who offered to cover a leave.
-- ============================================================================

alter table public.coach_leave_requests
  add column if not exists cover_status text not null default 'none'
    check (cover_status in ('none', 'open', 'filled'));

-- Backfill: any already-approved leave that has a replacement is 'filled'.
update public.coach_leave_requests
  set cover_status = 'filled'
  where status = 'approved' and replacement_coach_id is not null and cover_status = 'none';

create table if not exists public.coach_cover_offers (
  id         uuid primary key default gen_random_uuid(),
  leave_id   uuid not null references public.coach_leave_requests(id) on delete cascade,
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'offered' check (status in ('offered', 'confirmed', 'declined')),
  created_at timestamptz not null default now(),
  unique (leave_id, coach_id)
);
create index if not exists idx_cover_offers_leave on public.coach_cover_offers(leave_id);
create index if not exists idx_cover_offers_coach on public.coach_cover_offers(coach_id);

alter table public.coach_cover_offers enable row level security;

-- Admins manage every offer (confirm / clean up).
drop policy if exists cover_offers_admin on public.coach_cover_offers;
create policy cover_offers_admin on public.coach_cover_offers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- A coach sees their own offers.
drop policy if exists cover_offers_coach_read on public.coach_cover_offers;
create policy cover_offers_coach_read on public.coach_cover_offers for select to authenticated
  using (coach_id = auth.uid());

-- A coach may offer to cover only an OPEN leave, and only as themselves.
-- (The subquery reads coach_leave_requests, whose own policies never reference
--  coach_cover_offers — no policy cycle, unlike the 0053/0056 incident.)
drop policy if exists cover_offers_coach_insert on public.coach_cover_offers;
create policy cover_offers_coach_insert on public.coach_cover_offers for insert to authenticated
  with check (
    coach_id = auth.uid()
    and public.app_role() = 'coach'
    and exists (
      select 1 from public.coach_leave_requests l
      where l.id = leave_id and l.cover_status = 'open'
    )
  );

-- A coach may withdraw (delete) their own pending offer.
drop policy if exists cover_offers_coach_delete on public.coach_cover_offers;
create policy cover_offers_coach_delete on public.coach_cover_offers for delete to authenticated
  using (coach_id = auth.uid() and status = 'offered');

-- Coaches need to READ the open leaves themselves to render the cover list.
-- Additive select policy (RLS policies OR together). Uses only cover_status +
-- app_role() (security definer) — no cross-table subquery, so no recursion.
drop policy if exists coach_leave_open_read on public.coach_leave_requests;
create policy coach_leave_open_read on public.coach_leave_requests for select to authenticated
  using (cover_status = 'open' and public.app_role() = 'coach');
