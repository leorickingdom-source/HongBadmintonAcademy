-- Richer fee plans for the enhanced fee calculator. All additive — the billing
-- `interval` enum (monthly/one_time) still drives auto-invoicing + Stripe and is
-- untouched. These fields power quoting only:
--   * sibling_discount_pct — single % off for the 2nd+ child (family pricing).
--   * sessions_per_week     — for per-session pricing + session-based proration.
--   * price_unit            — what `amount` represents when quoting
--                             (per month / week / session / one-off).
alter table fee_plans
  add column if not exists sibling_discount_pct numeric(5,2) not null default 0,
  add column if not exists sessions_per_week integer,
  add column if not exists price_unit text not null default 'month';

alter table fee_plans drop constraint if exists fee_plans_price_unit_chk;
alter table fee_plans add constraint fee_plans_price_unit_chk
  check (price_unit in ('month', 'week', 'session', 'once'));

-- Seed price_unit from the existing interval so current plans quote unchanged.
update fee_plans
set price_unit = case when interval = 'one_time' then 'once' else 'month' end
where price_unit = 'month';
