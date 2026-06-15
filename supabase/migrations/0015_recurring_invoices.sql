-- Recurring monthly billing. A student can be assigned a default fee plan; a
-- monthly cron then auto-raises that invoice each month (admin can still force
-- it from the Invoices page). Mirrors the auto Growth Report flow.

alter table public.students
  add column if not exists fee_plan_id uuid references public.fee_plans(id) on delete set null;

-- One auto-raised invoice per student per month per plan (dedupes repeated cron
-- runs / manual force). Partial so manual one-off invoices (fee_plan_id null)
-- never collide here.
create unique index if not exists uq_invoices_student_period_plan
  on public.invoices(student_id, period_month, fee_plan_id)
  where fee_plan_id is not null;
