-- ============================================================================
-- 0058_cover_acceptance.sql : let an ADMIN-ASSIGNED cover coach accept/decline.
--
-- 0053/0057 gave two cover paths: admin hand-picks (assign) or coaches claim
-- (open→confirm). In the ASSIGN path the chosen coach was just told — they
-- couldn't say no. This adds an acceptance state so a directly-assigned coach
-- can Accept (locks it in) or Decline (auto-reopens the slot to offers).
--
--   replacement_accepted:
--     null  — assigned, awaiting the coach's response
--     true  — the coach accepted (or claimed it themselves via the open path)
--     false — (unused; a decline reopens instead of parking a 'no')
-- ============================================================================

alter table public.coach_leave_requests
  add column if not exists replacement_accepted boolean;

-- Existing filled covers predate acceptance — treat them as already accepted so
-- they don't suddenly read as "awaiting response".
update public.coach_leave_requests
  set replacement_accepted = true
  where cover_status = 'filled' and replacement_coach_id is not null and replacement_accepted is null;
