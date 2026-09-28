-- Backup / soft-delete: nada de lo que carga el organizador en el modulo de
-- Capital (presupuestos, clientes, catalogo, paquetes, gastos, cobros,
-- packs mensuales) ni en los modulos nuevos de socios/traslados/lista
-- negra se borra en duro -- se marca deleted_at y desaparece de las
-- pantallas, pero sigue en la base por si hay que recuperarlo. La
-- "papelera" (/admin/papelera) deja verlo y restaurarlo.
begin;

alter table public.quotes add column if not exists deleted_at timestamptz;
alter table public.quote_catalog add column if not exists deleted_at timestamptz;
alter table public.quote_clients add column if not exists deleted_at timestamptz;
alter table public.quote_packages add column if not exists deleted_at timestamptz;
alter table public.expenses add column if not exists deleted_at timestamptz;
alter table public.quote_payments add column if not exists deleted_at timestamptz;
alter table public.monthly_packs add column if not exists deleted_at timestamptz;
alter table public.premium_members add column if not exists deleted_at timestamptz;
alter table public.blacklist_entries add column if not exists deleted_at timestamptz;
alter table public.transfer_routes add column if not exists deleted_at timestamptz;

create index if not exists quotes_deleted_at_idx on public.quotes (deleted_at);
create index if not exists quote_catalog_deleted_at_idx on public.quote_catalog (deleted_at);
create index if not exists quote_clients_deleted_at_idx on public.quote_clients (deleted_at);
create index if not exists quote_packages_deleted_at_idx on public.quote_packages (deleted_at);
create index if not exists expenses_deleted_at_idx on public.expenses (deleted_at);
create index if not exists quote_payments_deleted_at_idx on public.quote_payments (deleted_at);
create index if not exists monthly_packs_deleted_at_idx on public.monthly_packs (deleted_at);
create index if not exists premium_members_deleted_at_idx on public.premium_members (deleted_at);
create index if not exists blacklist_entries_deleted_at_idx on public.blacklist_entries (deleted_at);
create index if not exists transfer_routes_deleted_at_idx on public.transfer_routes (deleted_at);

-- Estos 2 indices unicos existentes NO eran parciales sobre deleted_at: si
-- se borra (soft) una factura de pack mensual o un socio, la fila borrada
-- seguia "ocupando" el codigo/periodo para siempre y bloqueaba generar de
-- nuevo o reusar ese codigo. Se recrean excluyendo las filas borradas.
drop index if exists public.quotes_monthly_pack_period_uq;
create unique index quotes_monthly_pack_period_uq on public.quotes (monthly_pack_id, pack_period) where monthly_pack_id is not null and deleted_at is null;

drop index if exists public.premium_members_org_code_uq;
create unique index premium_members_org_code_uq on public.premium_members (organization_id, member_code) where deleted_at is null;

commit;

notify pgrst, 'reload schema';
