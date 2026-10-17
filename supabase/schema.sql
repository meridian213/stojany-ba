-- Cyklostojany Bratislava – databáza pre zdieľané stojany, hodnotenia a fotky (Supabase / PostgreSQL)
-- Spusti celé v Supabase: SQL Editor -> New query -> Run.
-- Stojany z OpenStreetMap sa sem neukladajú, aplikácia ich číta priamo z OSM.

create extension if not exists pgcrypto;

-- Správcovia (e-maily, ktoré môžu schvaľovať návrhy)
create table if not exists public.admins (
  email text primary key
);

-- Stojany navrhnuté používateľmi
create table if not exists public.racks (
  id          uuid primary key,
  lat         double precision not null check (lat between 48.0 and 48.27),
  lon         double precision not null check (lon between 16.95 and 17.34),
  cat         text not null check (cat in ('safe','shelter','informal','bad','unknown')),
  capacity    int  check (capacity between 1 and 500),
  covered     boolean,
  note        text check (char_length(note) <= 300),
  photo_path  text check (photo_path is null or photo_path ~ '^racks/[0-9a-f-]{36}\.jpg$'),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now(),
  approved_at timestamptz,  -- nastavuje trigger pri schválení
  osm_consent boolean not null default false,  -- navrhovateľ súhlasí s použitím v OSM
  osm_note_id bigint        -- číslo poznámky v OSM, nastavuje správca
);

-- Hodnotenia (pre stojany z OSM aj pre navrhnuté). Jedno hodnotenie na stojan a zariadenie.
create table if not exists public.ratings (
  id             bigint generated always as identity primary key,
  rack_id        text not null check (rack_id ~ '^(osm:(node|way|relation)/[0-9]+|u:[0-9a-f-]{36})$'),
  device_id      text not null check (char_length(device_id) between 8 and 64),
  stars          int  not null check (stars between 1 and 5),
  frame          boolean,
  covered        boolean,
  lit            boolean,
  good_condition boolean,
  created_at     timestamptz not null default now(),
  unique (rack_id, device_id)
);

-- Je prihlásený používateľ správca?
-- Funkcia je v neverejnej schéme „private“, aby sa nedala volať cez API (/rest/v1/rpc).
-- Prístupové pravidlá ju volať môžu.
create schema if not exists private;
grant usage on schema private to anon, authenticated;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where email = (auth.jwt() ->> 'email'));
$$;
revoke execute on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

-- Dátum schválenia nastavuje databáza sama (pre údaj „pribudlo za týždeň“)
create or replace function private.set_approved_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.osm_note_id := null;
  end if;
  if new.status = 'approved' then
    if tg_op = 'INSERT' or old.status is distinct from 'approved' then
      new.approved_at := now();
    else
      new.approved_at := old.approved_at;
    end if;
  else
    new.approved_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists racks_approved_at on public.racks;
create trigger racks_approved_at
  before insert or update on public.racks
  for each row execute function private.set_approved_at();

alter table public.admins  enable row level security;
alter table public.racks   enable row level security;
alter table public.ratings enable row level security;

-- admins: prihlásený vidí len svoj vlastný riadok (tak aplikácia zistí, či je správca)
drop policy if exists admins_self on public.admins;
create policy admins_self on public.admins for select to authenticated
  using (email = (auth.jwt() ->> 'email'));

-- racks: všetci vidia schválené, správca všetko
drop policy if exists racks_read on public.racks;
create policy racks_read on public.racks for select to anon, authenticated
  using (status = 'approved' or private.is_admin());

-- racks: ktokoľvek môže navrhnúť, ale vždy len ako „čaká na schválenie“
drop policy if exists racks_insert on public.racks;
create policy racks_insert on public.racks for insert to anon, authenticated
  with check (status = 'pending');

-- racks: meniť stav môže len správca
drop policy if exists racks_admin_update on public.racks;
create policy racks_admin_update on public.racks for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- ratings: ktokoľvek číta a pridáva; meniť ani mazať sa nedá
drop policy if exists ratings_read on public.ratings;
create policy ratings_read on public.ratings for select to anon, authenticated using (true);
drop policy if exists ratings_insert on public.ratings;
create policy ratings_insert on public.ratings for insert to anon, authenticated with check (true);

-- device_id nezverejňujeme: verejne čitateľné sú len tieto stĺpce
revoke select on public.ratings from anon, authenticated;
grant select (rack_id, stars, frame, covered, lit, good_condition, created_at) on public.ratings to anon, authenticated;

-- Úložisko fotiek: verejné čítanie, nahrávať sa dá len JPEG do priečinka racks/, max 2 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists photos_upload on storage.objects;
create policy photos_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = 'racks' and storage.extension(name) = 'jpg');

-- Nakoniec pridaj seba ako správcu (nahraď e-mail):
-- insert into public.admins (email) values ('tvoj@email.sk');
