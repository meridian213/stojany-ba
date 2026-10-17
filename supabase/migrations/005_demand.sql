-- Hlásenia „Tu chýba stojan“. Anonymné: miesto, dôvod a čas; ID zariadenia je skryté.
-- Jedno zariadenie môže v jednej bunke (~37 × 37 m) hlasovať len raz.
-- Spusti celé naraz v SQL Editore.

begin;

create table if not exists public.demand (
  id         bigint generated always as identity primary key,
  lat        double precision not null check (lat between 48.0 and 48.27),
  lon        double precision not null check (lon between 16.95 and 17.34),
  reason     text not null check (reason in ('work','shop','school','transit','office','home','leisure','other')),
  device_id  text not null check (char_length(device_id) between 8 and 64),
  cell       text generated always as (round((lat * 3000)::numeric)::text || ':' || round((lon * 2000)::numeric)::text) stored,
  created_at timestamptz not null default now(),
  unique (device_id, cell)
);

alter table public.demand enable row level security;

drop policy if exists demand_read on public.demand;
create policy demand_read on public.demand for select to anon, authenticated using (true);

drop policy if exists demand_insert on public.demand;
create policy demand_insert on public.demand for insert to anon, authenticated with check (true);

-- mazať (spam) môže len správca
drop policy if exists demand_admin_delete on public.demand;
create policy demand_admin_delete on public.demand for delete to authenticated using (private.is_admin());

-- ID zariadenia nezverejňujeme
revoke select on public.demand from anon, authenticated;
grant select (id, lat, lon, reason, created_at) on public.demand to anon, authenticated;

commit;
