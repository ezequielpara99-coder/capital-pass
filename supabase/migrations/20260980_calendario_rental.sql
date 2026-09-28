-- Calendario de rental: hoy los presupuestos de rental no reservan un
-- equipo puntual en fechas puntuales -- esto agrega ese inventario
-- (rental_assets, ej. cada terminal fisica) y sus reservas (rental_bookings,
-- rango de fechas + a quien). La validacion de que un mismo equipo no
-- quede reservado 2 veces en fechas superpuestas se hace en la ruta de
-- API (no con un exclusion constraint de Postgres, para no depender de que
-- la extension btree_gist este habilitada en el proyecto).
begin;

create table if not exists public.rental_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'terminal',
  active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.rental_bookings (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.rental_assets(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  client_name text not null,
  starts_on date not null,
  ends_on date not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint rental_bookings_dates_ok check (ends_on >= starts_on)
);
create index if not exists rental_bookings_asset_idx on public.rental_bookings (asset_id, starts_on, ends_on);
create index if not exists rental_bookings_range_idx on public.rental_bookings (starts_on, ends_on);

alter table public.rental_assets enable row level security;
alter table public.rental_bookings enable row level security;
revoke all on public.rental_assets from anon, authenticated;
revoke all on public.rental_bookings from anon, authenticated;
grant all on public.rental_assets to service_role;
grant all on public.rental_bookings to service_role;

commit;

notify pgrst, 'reload schema';
