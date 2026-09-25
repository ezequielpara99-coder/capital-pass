-- Base del sistema de finanzas y clientes de Capital (pedido de Eze,
-- "Capital: sistema integral de clientes, presupuestos y finanzas") --
-- primera etapa: los cobros/pagos sobre un presupuesto y los gastos del
-- negocio, que son la base de los 4 conceptos centrales que pide el
-- sistema:
--
--   presupuestado = existe un presupuesto (cualquier estado salvo rechazado)
--   facturado     = el presupuesto quedo confirmado (status a_pagar/aceptado)
--   cobrado       = suma de los pagos registrados contra presupuestos facturados
--   pendiente     = facturado - cobrado
--   gastos        = suma de gastos registrados
--   resultado     = cobrado - gastos
--
-- No hizo falta tocar la tabla quotes ni sus estados existentes -- ya
-- alcanzan para distinguir presupuestado de facturado. Esto se construye
-- ENCIMA de lo que ya existe, sin modificar el editor de presupuestos ni
-- su flujo actual.
begin;

create table if not exists public.quote_payments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  paid_at date not null default current_date,
  method text not null default 'transferencia' check (method in ('transferencia', 'efectivo', 'mercadopago', 'tarjeta', 'otro')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists quote_payments_quote_idx on public.quote_payments(quote_id);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'general' check (kind in ('diseno', 'rental', 'general')),
  category text not null default 'otros',
  description text not null,
  amount_minor bigint not null check (amount_minor > 0),
  expense_date date not null default current_date,
  payment_method text not null default 'transferencia' check (payment_method in ('transferencia', 'efectivo', 'mercadopago', 'tarjeta', 'otro')),
  is_recurring boolean not null default false,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists expenses_date_idx on public.expenses(expense_date desc);

alter table public.quote_payments enable row level security;
alter table public.expenses enable row level security;

revoke all on public.quote_payments from anon, authenticated;
revoke all on public.expenses from anon, authenticated;
grant all on public.quote_payments to service_role;
grant all on public.expenses to service_role;

commit;

notify pgrst, 'reload schema';
