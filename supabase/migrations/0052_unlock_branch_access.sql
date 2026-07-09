-- ============================================================================
-- 0052_unlock_branch_access.sql
-- Owner change (2026-07-09): keep the branches feature AND the two admin tiers
-- (super_admin = owner: finance/staff/settings/refunds; admin = daily ops), but
-- DROP the per-branch wall on regular admins. Previously a plain 'admin' could
-- only touch rows in their own branch; now every admin can see/manage ALL
-- branches. Branches remain as a data dimension + view filter — just not an
-- access boundary between admins.
--
-- One-shot: admin_branch_ok() stops checking the caller's branch, so every
-- policy built on it (students/classes/sessions/invoices/payments and the
-- admin_of_class/session/student wrappers) now spans all branches for any admin.
--
-- Deliberately UNCHANGED (still super_admin-only): is_super_admin() and the
-- policies on it (branches WRITE / staff lifecycle / courts / club / court_bookings),
-- plus all app-layer finance visibility. Regular admins gain branch breadth,
-- not finance or structural powers.
-- ============================================================================

create or replace function public.admin_branch_ok(p_branch uuid)
returns boolean language sql stable security definer set search_path = public as $$
  -- Branch is no longer an access wall between admins: any admin, any branch.
  select public.is_admin();
$$;
