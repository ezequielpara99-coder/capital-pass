-- Membresia premium: un addon que el organizador paga (fuera del sistema,
-- Eze lo habilita a mano desde /admin, igual que la cortesia) y que le deja
-- llevar un padron de clientes "socios premium" -- gente reconocida en
-- todos sus eventos, con su propio codigo. Los beneficios concretos
-- (descuento, prioridad) se definen mas adelante; esto es la base: quien
-- es socio y de que organizacion.
begin;

alter table public.organizations add column if not exists premium_memberships_enabled boolean not null default false;

create table if not exists public.premium_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  dni text,
  phone text,
  email text,
  member_code text not null,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  starts_at date not null default current_date,
  expires_at date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists premium_members_org_code_uq on public.premium_members (organization_id, member_code);
create index if not exists premium_members_org_idx on public.premium_members (organization_id);

alter table public.premium_members enable row level security;
revoke all on public.premium_members from anon, authenticated;
grant all on public.premium_members to service_role;

commit;

notify pgrst, 'reload schema';
