-- ============================================================================
-- 0055_trial_lead_session.sql : Trial funnel P2b — pick a real session.
--
-- The public /trial form used to ask parents to type a free-text "preferred
-- day/time" and (optionally) pick a branch. That's low-signal and creates work
-- for an admin. This migration attaches a real upcoming session id so the lead
-- is booked into an actual slot (auto-fills branch, sets status trial_booked,
-- fires the WhatsApp confirm). Old `preferred_slot` stays for historical rows
-- + as a human-readable fallback label.
-- ============================================================================

alter table public.trial_leads
  add column if not exists preferred_session_id uuid references public.sessions(id) on delete set null;

create index if not exists trial_leads_session_idx on public.trial_leads(preferred_session_id);
