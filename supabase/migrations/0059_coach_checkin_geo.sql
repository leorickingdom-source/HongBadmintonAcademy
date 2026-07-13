-- ============================================================================
-- 0059_coach_checkin_geo.sql
-- Geofence evidence for coach self-check-in. When an academy location is
-- configured (ACADEMY_LAT/ACADEMY_LNG), the coach's device position is captured
-- at "I'm here" and the server rejects check-ins outside the radius. We store
-- the coordinates + computed distance so the admin coverage page has an audit
-- trail (a check-in with method 'self_geo' + a small distance is real presence;
-- 'self' with no geo means the coach's location was unavailable/optional).
--   method: 'self' | 'self_geo' | 'admin'
-- ============================================================================
alter table public.coach_checkins
  add column if not exists lat        double precision,
  add column if not exists lng        double precision,
  add column if not exists distance_m integer;
