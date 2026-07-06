-- ============================================================================
-- 0039_leave_attachment.sql
-- Optional document attached to a leave request (e.g. medical cert). Stored in
-- a PRIVATE bucket; only service-role (parent upload action + admin signed-URL
-- view) touches it — no anon/authenticated storage policies needed.
-- ============================================================================
alter table public.leave_requests add column if not exists attachment_path text;

insert into storage.buckets (id, name, public)
values ('leave-docs', 'leave-docs', false)
on conflict (id) do nothing;
