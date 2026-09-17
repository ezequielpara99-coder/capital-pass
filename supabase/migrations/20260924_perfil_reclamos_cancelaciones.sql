-- Capital Pass: foto de perfil del organizador, sistema de reclamos, y
-- cancelacion de ventas de barra/mesa. Reutiliza los patrones ya probados:
-- bucket publico con el mismo guard de storage.buckets, tablas nuevas con
-- revoke total + acceso solo via service_role/RPC, y un RPC de cancelacion
-- con lock + idempotencia igual que confirm_online_sale.
begin;

-- =============================================================
-- 1. Foto de perfil
-- =============================================================

alter table public.profiles add column if not exists avatar_path text;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('avatars', 'avatars', true)
    on conflict (id) do nothing;
  end if;
end $$;

-- =============================================================
-- 2. Reclamos de organizadores hacia Capital Pass
-- =============================================================

create type public.complaint_status as enum ('abierto', 'resuelto');

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  created_by uuid not null references auth.users(id),
  subject text not null,
  message text not null,
  status public.complaint_status not null default 'abierto',
  admin_response text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.complaints enable row level security;
revoke all on public.complaints from anon, authenticated;
grant all on public.complaints to service_role;

commit;

begin;

-- =============================================================
-- 3. Cancelar una venta de barra (trago vendido por el bartender)
-- =============================================================

alter table public.bar_sales add column if not exists cancelled_at timestamptz;
alter table public.bar_sales add column if not exists cancel_reason text;

create or replace function public.cancel_bar_sale(p_sale_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_sale public.bar_sales%rowtype;
  v_organization_id uuid;
begin
  select * into v_sale from public.bar_sales where id = p_sale_id for update;
  if not found then
    raise exception 'La venta no existe';
  end if;

  if v_sale.cancelled_at is not null then
    raise exception 'Esa venta ya estaba cancelada';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Indica el motivo de la cancelacion';
  end if;

  select e.organization_id into v_organization_id from public.events e where e.id = v_sale.event_id;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = v_organization_id and om.user_id = auth.uid()
      and om.role = 'organizer' and om.status = 'active'
  ) then
    raise exception 'No tenes permiso para cancelar ventas de este evento';
  end if;

  update public.bar_sales set cancelled_at = now(), cancel_reason = p_reason where id = p_sale_id;

  update public.bar_stock set quantity = quantity + v_sale.quantity, updated_at = now()
  where bar_id = v_sale.bar_id and event_product_id = v_sale.event_product_id;

  insert into public.stock_movements (event_id, event_product_id, bar_id, type, quantity, reason, actor_user_id)
  values (v_sale.event_id, v_sale.event_product_id, v_sale.bar_id, 'ajuste', v_sale.quantity, 'Cancelacion de venta: ' || p_reason, auth.uid());
end;
$$;
revoke all on function public.cancel_bar_sale(uuid, text) from public, anon;
grant execute on function public.cancel_bar_sale(uuid, text) to authenticated;

-- =============================================================
-- 4. Cancelar una venta de mesa
-- =============================================================

create or replace function public.cancel_table_sale(p_sale_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_sale public.sales%rowtype;
begin
  select * into v_sale from public.sales where id = p_sale_id and channel = 'mesa' for update;
  if not found then
    raise exception 'La venta de mesa no existe';
  end if;

  if v_sale.status = 'cancelled' then
    raise exception 'Esa venta ya estaba cancelada';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Indica el motivo de la cancelacion';
  end if;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = v_sale.organization_id and om.user_id = auth.uid()
      and om.role = 'organizer' and om.status = 'active'
  ) then
    raise exception 'No tenes permiso para cancelar ventas de este evento';
  end if;

  update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;

  if v_sale.table_id is not null then
    update public.bar_tables set status = 'available' where id = v_sale.table_id;
  end if;
end;
$$;
revoke all on function public.cancel_table_sale(uuid, text) from public, anon;
grant execute on function public.cancel_table_sale(uuid, text) to authenticated;

commit;
