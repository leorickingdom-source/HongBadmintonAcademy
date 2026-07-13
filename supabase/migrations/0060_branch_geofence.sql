-- ============================================================================
-- 0060_branch_geofence.sql
-- Per-branch check-in geofence. Each branch carries its own venue coordinate +
-- radius, so a coach's "I'm here" is validated against the branch that owns the
-- session (sessions.branch_id). Off by default — a branch opts in by setting
-- geofence_enabled + coordinates from the admin Branches page ("Use my current
-- location"). Falls back to the ACADEMY_LAT/LNG env vars when a branch hasn't
-- configured its own (see lib/geofence.ts).
-- ============================================================================
alter table public.branches
  add column if not exists lat               double precision,
  add column if not exists lng               double precision,
  add column if not exists geofence_radius_m integer not null default 300,
  add column if not exists geofence_enabled  boolean not null default false,
  add column if not exists geofence_required boolean not null default false;
