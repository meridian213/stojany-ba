-- Presun funkcie is_admin() do neverejnej schémy, aby sa nedala volať cez API.
-- Pre databázy, kde už bol spustený pôvodný schema.sql. Spusti celé naraz v SQL Editore.

begin;

create schema if not exists private;
grant usage on schema private to anon, authenticated;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where email = (auth.jwt() ->> 'email'));
$$;
revoke execute on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

alter policy racks_read on public.racks
  using (status = 'approved' or private.is_admin());
alter policy racks_admin_update on public.racks
  using (private.is_admin()) with check (private.is_admin());

drop function public.is_admin();

commit;
