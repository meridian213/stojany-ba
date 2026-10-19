-- Nový dôvod pri hlásení „Tu chýba stojan“: Deti – krúžky, aktivity (kids).
-- Spusti celé naraz v SQL Editore (po 005_demand.sql).

begin;

alter table public.demand drop constraint if exists demand_reason_check;
alter table public.demand add constraint demand_reason_check
  check (reason in ('work','shop','school','kids','transit','office','home','leisure','other'));

commit;
