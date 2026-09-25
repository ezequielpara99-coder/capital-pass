-- Packs mensuales: clientes que pagan un monto fijo todos los meses (ej. un
-- cliente de diseño mensual o un alquiler fijo). En vez de armar el
-- presupuesto de cero cada mes, se guarda el pack una vez y cada mes se
-- genera con un click el presupuesto (factura) de ese mes, ya en estado
-- "a_pagar" -- listo para cobrar.
--
-- El indice unico (monthly_pack_id, pack_period) evita generar dos
-- facturas para el mismo pack en el mismo mes por un doble click.
begin;

create table if not exists public.monthly_packs (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  client_contact text,
  client_phone text,
  client_email text,
  kind text not null default 'diseno' check (kind in ('diseno', 'rental', 'otro')),
  description text,
  package_price_minor bigint not null default 0 check (package_price_minor >= 0),
  active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists monthly_packs_active_idx on public.monthly_packs (active);

alter table public.quotes add column if not exists monthly_pack_id uuid references public.monthly_packs(id) on delete set null;
alter table public.quotes add column if not exists pack_period date;

create unique index if not exists quotes_monthly_pack_period_uq on public.quotes (monthly_pack_id, pack_period) where monthly_pack_id is not null;

alter table public.monthly_packs enable row level security;
revoke all on public.monthly_packs from anon, authenticated;
grant all on public.monthly_packs to service_role;

commit;

notify pgrst, 'reload schema';
