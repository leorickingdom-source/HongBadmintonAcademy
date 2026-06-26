-- Every student starts at Level 1 (Starter) — the training ladder has no
-- "unleveled" state. Default new rows to 1 and backfill existing students so the
-- parent dashboard, coach exam list and admin overview all show a real level
-- (was showing "Not yet leveled" for anyone who hadn't sat an exam yet).
alter table public.students alter column level set default 1;
update public.students set level = 1 where level is null;
