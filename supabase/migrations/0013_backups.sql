-- ============================================================================
-- 0013_backups.sql : daily logical-backup support
--   backups (private) bucket — daily JSON snapshots written by the backup cron
--     (/api/cron/backup). Served to admins via signed URLs / the dashboard.
--   list_backup_tables() — every public base table, so the backup is
--     self-maintaining: new tables are captured automatically (no hand-kept
--     list to drift out of date).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

-- Admins may browse/download backups through their session; service-role writes
-- from the cron bypass RLS.
create policy "hba admin backups"
  on storage.objects for all to authenticated
  using (bucket_id = 'backups' and public.is_admin())
  with check (bucket_id = 'backups' and public.is_admin());

-- Scalar set of public table names for the backup job.
create or replace function public.list_backup_tables()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select tablename
  from pg_tables
  where schemaname = 'public'
  order by tablename;
$$;

-- Backup-only helper: never callable by the public/anon key; the cron uses the
-- service role.
revoke all on function public.list_backup_tables() from public;
grant execute on function public.list_backup_tables() to service_role;
