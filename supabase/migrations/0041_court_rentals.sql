-- Court rental COST tracking (an operating expense the academy pays to rent
-- courts) + a per-court analytics report. Super-admin only — this is academy
-- finance, like the analytics dashboard. Branch admins never see it.

create table if not exists public.courts (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid references public.branches(id) on delete set null,
  name        text not null,
  hourly_rate numeric(10,2) not null default 0,
  currency    text not null default 'MYR',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.court_rentals (
  id          uuid primary key default gen_random_uuid(),
  court_id    uuid not null references public.courts(id) on delete cascade,
  branch_id   uuid references public.branches(id) on delete set null,
  rental_date date not null,
  hours       numeric(6,2) not null default 0,
  amount      numeric(10,2) not null default 0,
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists court_rentals_date_idx on public.court_rentals (rental_date);
create index if not exists court_rentals_court_idx on public.court_rentals (court_id);
create index if not exists courts_branch_idx on public.courts (branch_id);

alter table public.courts enable row level security;
alter table public.court_rentals enable row level security;

-- Super-admin only (academy finance). is_super_admin() ships from migration 0030.
create policy courts_super_all on public.courts for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy court_rentals_super_all on public.court_rentals for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
