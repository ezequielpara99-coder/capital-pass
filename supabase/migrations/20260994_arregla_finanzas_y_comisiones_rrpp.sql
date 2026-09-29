-- Bugs reales encontrados en una ronda de auditoria sobre finanzas y
-- comisiones de RRPP:
--
-- 1. El "reloj" del recordatorio de cobro pendiente (>15 dias sin cobrarse)
--    usaba quotes.updated_at, que se pisa con CUALQUIER edicion del
--    presupuesto (corregir un typo en las notas, por ejemplo), no solo
--    cuando pasa a facturado. Un presupuesto vencido dejaba de verse vencido
--    apenas alguien lo tocaba por cualquier motivo. Agrega status_changed_at,
--    que un trigger actualiza SOLO cuando cambia el status.
--
-- 2. rrpp_commission_payments (usada por app/api/rrpps/route.ts y los
--    informes) nunca tuvo una migracion en el repo -- existia solo en la
--    base real, creada por fuera del flujo normal. Se recupera aca (create
--    table if not exists, sin efecto en la base real donde ya existe) y de
--    paso se le agrega idempotency_key: registrar un pago no tenia ninguna
--    proteccion contra un reintento de red que lo duplicara.
begin;

-- =============================================================
-- 1. status_changed_at en presupuestos
-- =============================================================

alter table public.quotes add column if not exists status_changed_at timestamptz;
update public.quotes set status_changed_at = coalesce(status_changed_at, updated_at, created_at) where status_changed_at is null;
alter table public.quotes alter column status_changed_at set default now();

create or replace function public.cp_quote_status_changed()
returns trigger
language plpgsql
as $function$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$function$;

drop trigger if exists quotes_status_changed on public.quotes;
create trigger quotes_status_changed
  before update of status on public.quotes
  for each row
  execute function public.cp_quote_status_changed();

-- =============================================================
-- 2. rrpp_commission_payments: recuperar la tabla (ya existe en la base
--    real, esto la deja versionada) + idempotencia.
-- =============================================================

create table if not exists public.rrpp_commission_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  event_staff_id uuid not null references public.event_staff(id) on delete cascade,
  organization_member_id uuid not null references public.organization_members(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'ARS',
  paid_at timestamptz not null default now(),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists rrpp_commission_payments_event_idx on public.rrpp_commission_payments (event_id);
create index if not exists rrpp_commission_payments_member_idx on public.rrpp_commission_payments (organization_member_id);

alter table public.rrpp_commission_payments enable row level security;
revoke all on public.rrpp_commission_payments from anon, authenticated;
grant all on public.rrpp_commission_payments to service_role;

alter table public.rrpp_commission_payments add column if not exists idempotency_key uuid;
create unique index if not exists rrpp_commission_payments_idempotency_uq on public.rrpp_commission_payments (idempotency_key) where idempotency_key is not null;

commit;

notify pgrst, 'reload schema';
