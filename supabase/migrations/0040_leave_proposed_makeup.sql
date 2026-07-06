-- Parent-proposed makeup: the parent picks a preferred makeup session when
-- requesting leave; the admin confirms it (copying it to makeup_session_id on
-- approve) or overrides. Additive + nullable — existing rows/flows unaffected.
alter table public.leave_requests
  add column if not exists proposed_makeup_session_id uuid
    references public.sessions(id) on delete set null;

create index if not exists leave_requests_proposed_makeup_idx
  on public.leave_requests (proposed_makeup_session_id);
