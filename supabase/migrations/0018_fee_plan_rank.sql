-- Optional class-rank tag on a fee plan (Beginner/Intermediate/Advanced/Elite),
-- so plans can be grouped/labelled by the tier they're meant for. Free-text in
-- the DB; the app constrains it to the fixed rank set (see src/lib/ranks.ts).
alter table public.fee_plans add column if not exists rank text;
