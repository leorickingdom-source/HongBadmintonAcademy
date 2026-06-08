-- ============================================================================
-- 0004_storage.sql : storage buckets
--   avatars         (public)  — profile pictures
--   student-photos  (public)  — student photos
--   scorecards      (private) — monthly PDF score cards; served via signed URLs
-- Uploads are performed server-side with the service role, so object-level
-- policies are intentionally minimal.
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('avatars',        'avatars',        true),
  ('student-photos', 'student-photos', true),
  ('scorecards',     'scorecards',     false)
on conflict (id) do nothing;

-- Admins may manage objects in any HBA bucket through their session, too.
create policy "hba admin objects"
  on storage.objects for all to authenticated
  using (bucket_id in ('avatars','student-photos','scorecards') and public.is_admin())
  with check (bucket_id in ('avatars','student-photos','scorecards') and public.is_admin());
