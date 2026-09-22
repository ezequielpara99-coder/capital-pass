-- Directorio de clientes para presupuestos: guardar un cliente una vez y
-- reutilizarlo en presupuestos futuros (nombre, contacto, telefono, email),
-- igual que ya existe un catalogo reutilizable de items.
begin;

create table if not exists public.quote_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quote_clients_name_idx on public.quote_clients (name);

alter table public.quote_clients enable row level security;
revoke all on public.quote_clients from anon, authenticated;
grant all on public.quote_clients to service_role;

commit;

notify pgrst, 'reload schema';
