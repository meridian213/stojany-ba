-- Zúženie práv pre Data API na to, čo aplikácia naozaj používa.
-- Supabase predvolene dáva rolám anon a authenticated všetky práva (vrátane UPDATE, DELETE, TRUNCATE);
-- dáta chránili len pravidlá RLS. Teraz platí aj obmedzenie na úrovni práv.
-- Spusti celé naraz v SQL Editore (po 006).

begin;

revoke all on public.admins, public.racks, public.ratings, public.demand from anon, authenticated;

-- správcovia: prihlásený si overí, či je správca (RLS: len vlastný riadok)
grant select on public.admins to authenticated;

-- stojany: čítanie a návrh; zmena stavu len pre prihláseného (RLS: len správca)
grant select, insert on public.racks to anon, authenticated;
grant update on public.racks to authenticated;

-- hodnotenia: zápis; čítanie bez ID zariadenia
grant insert on public.ratings to anon, authenticated;
grant select (rack_id, stars, frame, covered, lit, good_condition, created_at) on public.ratings to anon, authenticated;

-- hlasy „Tu chýba stojan“: zápis; čítanie bez ID zariadenia; mazanie spamu (RLS: len správca)
grant insert on public.demand to anon, authenticated;
grant select (id, lat, lon, reason, created_at) on public.demand to anon, authenticated;
grant delete on public.demand to authenticated;

commit;
