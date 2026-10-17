-- Súhlas navrhovateľa s použitím v OpenStreetMap a číslo poznámky v OSM.
-- Spusti celé naraz v SQL Editore (po 003_racks_approved_at.sql).

begin;

alter table public.racks add column if not exists osm_consent boolean not null default false;
alter table public.racks add column if not exists osm_note_id bigint;

-- Pri vložení návrhu databáza sama vynuluje dátum schválenia aj číslo poznámky,
-- aby ich navrhovateľ nemohol podvrhnúť. Nastavuje ich len správca.
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

commit;
