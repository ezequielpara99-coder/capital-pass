-- Cierre mensual: una vez cerrado un mes, sus numeros (presupuestado,
-- facturado, cobrado, pendiente, gastos, resultado de ESE mes) quedan
-- fijados para siempre, aunque despues se editen presupuestos o gastos
-- viejos -- para tener un "libro cerrado" confiable mes a mes.
begin;

create table if not exists public.monthly_closures (
  id uuid primary key default gen_random_uuid(),
  period date not null unique,
  presupuestado_minor bigint not null default 0,
  facturado_minor bigint not null default 0,
  cobrado_minor bigint not null default 0,
  pendiente_minor bigint not null default 0,
  gastos_minor bigint not null default 0,
  resultado_minor bigint not null,
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz not null default now()
);
create index if not exists monthly_closures_period_idx on public.monthly_closures (period desc);

alter table public.monthly_closures enable row level security;
revoke all on public.monthly_closures from anon, authenticated;
grant all on public.monthly_closures to service_role;

commit;

notify pgrst, 'reload schema';
