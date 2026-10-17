-- Dátum schválenia návrhu, aby sa dalo zobraziť, koľko stojanov pribudlo za posledný týždeň.
-- Dátum nastavuje databáza sama, aplikácia ho nemôže podvrhnúť. Spusti celé naraz v SQL Editore.

begin;

alter table public.racks add column if not exists approved_at timestamptz;

create or replace function private.set_approved_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'approved' then
    if tg_op = 'INSERT' or old.status is distinct from 'approved' then
      new.approved_at := now();
    else
      new.approved_at := old.approved_at;   -- pri inej úprave sa dátum nemení
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

commit;
