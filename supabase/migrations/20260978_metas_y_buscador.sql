-- Metas: objetivo de cobrado por mes, para comparar contra lo cobrado real
-- en /admin/finanzas. El buscador global (20260977 en adelante) no necesita
-- tablas nuevas -- esta migracion es solo para metas.
begin;

create table if not exists public.finance_goals (
  id uuid primary key default gen_random_uuid(),
  period date not null unique,
  goal_minor bigint not null check (goal_minor > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_goals enable row level security;
revoke all on public.finance_goals from anon, authenticated;
grant all on public.finance_goals to service_role;

commit;

notify pgrst, 'reload schema';
