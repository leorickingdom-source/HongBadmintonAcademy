-- ============================================================================
-- seed.sql — LOCAL DEV demo data (runs on `supabase db reset`).
-- Directly seeds auth.users (local only). On a hosted project create users via
-- the dashboard or scripts/create-admin.mjs instead.
--
-- All demo logins use password:  Password123!
--   admin@hba.test  /  coach1@hba.test  /  coach2@hba.test
--   parent1@hba.test /  parent2@hba.test
-- ============================================================================

-- Fixed UUIDs so we can wire relationships deterministically.
-- admin 0001 | coaches 0011/0012 | parents 0021/0022
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
   confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000001','authenticated','authenticated',
   'admin@hba.test', crypt('Password123!', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Academy Admin","role":"admin","phone":"+60123000001"}','','','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000011','authenticated','authenticated',
   'coach1@hba.test', crypt('Password123!', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Coach Lee","role":"coach","phone":"+60123000011"}','','','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000012','authenticated','authenticated',
   'coach2@hba.test', crypt('Password123!', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Coach Tan","role":"coach","phone":"+60123000012"}','','','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000021','authenticated','authenticated',
   'parent1@hba.test', crypt('Password123!', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Mr Wong","role":"parent","phone":"+60123000021"}','','','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000022','authenticated','authenticated',
   'parent2@hba.test', crypt('Password123!', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Mrs Lim","role":"parent","phone":"+60123000022"}','','','','')
on conflict (id) do nothing;

-- Identities (some GoTrue versions require an identity row for email login)
insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email),
       'email', u.id::text, now(), now(), now()
from auth.users u
where u.email like '%@hba.test'
on conflict do nothing;

-- ─── Students ───────────────────────────────────────────────────────────────
insert into public.students (id, full_name, dob, gender, parent_id, nfc_tag_uid, status) values
  ('00000000-0000-0000-0000-000000000031','Wong Jia Hui','2014-03-12','F','00000000-0000-0000-0000-000000000021','04A1B2C301','active'),
  ('00000000-0000-0000-0000-000000000032','Wong Jia Wei','2016-07-05','M','00000000-0000-0000-0000-000000000021','04A1B2C302','active'),
  ('00000000-0000-0000-0000-000000000033','Lim Zi Xuan','2013-11-21','M','00000000-0000-0000-0000-000000000022','04A1B2C303','active')
on conflict (id) do nothing;

-- ─── Class + coaches + schedule ─────────────────────────────────────────────
insert into public.classes (id, name, level, description, coach_id, default_location, capacity) values
  ('00000000-0000-0000-0000-000000000041','Junior Squad A','Beginner','Mon/Wed junior training','00000000-0000-0000-0000-000000000011','Court 1',12)
on conflict (id) do nothing;

insert into public.class_coaches (class_id, coach_id) values
  ('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000012')
on conflict do nothing;

insert into public.class_schedules (id, class_id, day_of_week, start_time, end_time, location, grace_minutes) values
  ('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000041',1,'18:00','19:30','Court 1',15),
  ('00000000-0000-0000-0000-000000000052','00000000-0000-0000-0000-000000000041',3,'18:00','19:30','Court 1',15)
on conflict (id) do nothing;

insert into public.enrollments (student_id, class_id) values
  ('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000041'),
  ('00000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000041'),
  ('00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000041')
on conflict do nothing;

-- A session happening today, so the live attendance dashboard has data.
insert into public.sessions (id, class_id, schedule_id, session_date, start_time, end_time, location, status) values
  ('00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000041',
   '00000000-0000-0000-0000-000000000051', current_date, '18:00','19:30','Court 1','scheduled')
on conflict (id) do nothing;

-- ─── Marking scheme (placeholder; client supplies real criteria/weights) ─────
insert into public.marking_schemes (id, name, description, is_active) values
  ('00000000-0000-0000-0000-000000000071','Junior Skills v1','Default scheme — replace with client scheme',true)
on conflict (id) do nothing;

insert into public.marking_criteria (scheme_id, name, weight, max_score, sort_order) values
  ('00000000-0000-0000-0000-000000000071','Footwork',2,10,1),
  ('00000000-0000-0000-0000-000000000071','Clears',1.5,10,2),
  ('00000000-0000-0000-0000-000000000071','Smash',1.5,10,3),
  ('00000000-0000-0000-0000-000000000071','Net Play',1,10,4),
  ('00000000-0000-0000-0000-000000000071','Attitude',1,10,5)
on conflict do nothing;

-- ─── Fees + a sample invoice + reward rule ──────────────────────────────────
insert into public.fee_plans (id, name, description, amount, currency, interval) values
  ('00000000-0000-0000-0000-000000000081','Monthly — Junior','Monthly junior training fee',150.00,'MYR','monthly')
on conflict (id) do nothing;

insert into public.invoices (student_id, parent_id, fee_plan_id, description, amount, currency, period_month, due_date, status) values
  ('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000081','Monthly fee', 150.00,'MYR', date_trunc('month', current_date)::date,
   (date_trunc('month', current_date) + interval '14 days')::date, 'unpaid')
on conflict do nothing;

insert into public.reward_rules (name, description, config, points, is_active) values
  ('Perfect Attendance','Awarded when a student attends every session in a month',
   '{"type":"attendance","threshold":1.0}', 50, true)
on conflict do nothing;
