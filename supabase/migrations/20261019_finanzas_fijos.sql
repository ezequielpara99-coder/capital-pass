-- Cuentas del mes (admin > Finanzas > Cuentas del mes): ingresos y gastos
-- FIJOS mensuales de Eze, separados en "negocio" y "personal", en pesos o en
-- dolares. Los de dolares se pasan a pesos con la cotizacion del dia (por
-- defecto dolar tarjeta, que ya incluye la percepcion del 30%) y pueden
-- sumar el IVA 21% de servicios digitales del exterior. Los impuestos fijos
-- (monotributo, etc.) se cargan como un gasto mas.
--
-- Solo la usa el admin de la plataforma, por el servidor (service_role).
begin;

create table if not exists public.finance_fixed_items (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'negocio' check (scope in ('negocio', 'personal')),
  kind text not null check (kind in ('ingreso', 'gasto')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null default 'otros' check (char_length(category) <= 60),
  amount numeric(14, 2) not null check (amount > 0 and amount < 10000000000),
  currency text not null default 'ARS' check (currency in ('ARS', 'USD')),
  dollar_type text not null default 'tarjeta' check (dollar_type in ('tarjeta', 'blue', 'mep', 'oficial')),
  iva_exterior boolean not null default false,
  day_of_month smallint check (day_of_month is null or day_of_month between 1 and 31),
  active boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists finance_fixed_items_scope_idx on public.finance_fixed_items (scope, kind);

alter table public.finance_fixed_items enable row level security;
revoke all on public.finance_fixed_items from anon, authenticated;
grant all on public.finance_fixed_items to service_role;

commit;

notify pgrst, 'reload schema';
