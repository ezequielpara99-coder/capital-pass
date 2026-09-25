-- Historial de precios del catalogo de presupuestos: cada vez que cambia
-- unit_price_minor de un item del catalogo (o se crea el item), queda un
-- registro con la fecha -- para poder ver cuanto costaba algo en el pasado
-- (pedido explicito del spec de Capital: "catalogo de servicios con
-- historial de precios").
begin;

create table if not exists public.quote_catalog_price_history (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.quote_catalog(id) on delete cascade,
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null
);
create index if not exists quote_catalog_price_history_catalog_idx on public.quote_catalog_price_history (catalog_id, changed_at desc);

alter table public.quote_catalog_price_history enable row level security;
revoke all on public.quote_catalog_price_history from anon, authenticated;
grant all on public.quote_catalog_price_history to service_role;

-- Deja un primer punto en el historial para el catalogo que ya existe, con
-- el precio actual, para que la linea de tiempo no arranque vacia.
insert into public.quote_catalog_price_history (catalog_id, unit_price_minor, changed_at)
select id, unit_price_minor, created_at from public.quote_catalog
where not exists (
  select 1 from public.quote_catalog_price_history where catalog_id = quote_catalog.id
);

commit;

notify pgrst, 'reload schema';
