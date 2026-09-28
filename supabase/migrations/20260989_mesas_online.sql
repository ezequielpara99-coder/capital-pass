-- Comprar una mesa desde la pagina publica del evento, con Mercado Pago.
-- Reusa toda la maquinaria de ventas online (webhook de Mercado Pago,
-- confirm_online_sale y el cron que cancela carritos sin pagar a los 30
-- minutos): una mesa online es una venta online SIN entradas, con table_id.
-- Lo unico nuevo es que la mesa tiene que quedar reservada mientras se paga
-- y liberarse si la venta se cancela o se reembolsa; eso lo garantiza un
-- trigger sobre sales, asi funciona igual venga la cancelacion del cron, del
-- webhook o de un reembolso, sin tocar confirm_online_sale.
begin;

-- =============================================================
-- 1. Trigger: la mesa sigue el estado de la venta
-- =============================================================

create or replace function public.cp_sale_table_sync()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.table_id is null or new.channel <> 'online' then
    return new;
  end if;

  -- Venta cancelada o reembolsada: la mesa vuelve a estar disponible.
  if new.status in ('cancelled', 'refunded') and old.status not in ('cancelled', 'refunded') then
    update public.bar_tables set status = 'available' where id = new.table_id and status = 'reserved';

  -- Pago aprobado tarde: el cron ya habia cancelado la venta y liberado la
  -- mesa, y ahora se revive. Si nadie se la llevo, se vuelve a reservar; si
  -- ya la tomo otra persona, la venta queda cancelada (requiere reintegro
  -- manual), igual que pasa con las entradas sin cupo.
  elsif new.status = 'confirmed' and old.status = 'cancelled' then
    update public.bar_tables set status = 'reserved' where id = new.table_id and status = 'available';
    if not found then
      raise warning 'Mesa online: pago aprobado pero la mesa ya fue tomada, venta % queda cancelada -- requiere reintegro manual', new.id;
      new.status := 'cancelled';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists cp_sale_table_sync_trg on public.sales;
create trigger cp_sale_table_sync_trg
  before update of status on public.sales
  for each row execute function public.cp_sale_table_sync();

-- =============================================================
-- 2. Crear la venta online de una mesa
-- =============================================================

create or replace function public.create_online_table_sale(
  p_event_id uuid,
  p_table_id uuid,
  p_buyer_first_name text,
  p_buyer_last_name text,
  p_buyer_dni text,
  p_buyer_phone text,
  p_buyer_email text default null
)
returns table(sale_id uuid, buyer_id uuid, total_minor bigint, table_name text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org_id uuid;
  v_event_status public.event_status;
  v_name text;
  v_price bigint;
  v_status text;
  v_buyer_id uuid;
  v_sale_id uuid;
begin
  select e.organization_id, e.status into v_org_id, v_event_status from public.events e where e.id = p_event_id;
  if v_org_id is null then
    raise exception 'El evento no existe';
  end if;

  if not public.cp_org_has_service(v_org_id) then
    raise exception 'La organizacion necesita una suscripcion activa.';
  end if;
  if v_event_status not in ('upcoming', 'active') then
    raise exception 'Este evento no esta habilitado para reservar mesas';
  end if;
  if not exists (select 1 from public.organization_mercadopago_accounts where organization_id = v_org_id) then
    raise exception 'El organizador todavia no conecto su cuenta de Mercado Pago';
  end if;

  if p_buyer_first_name is null or btrim(p_buyer_first_name) = '' then
    raise exception 'El nombre del comprador es obligatorio';
  end if;
  if p_buyer_last_name is null or btrim(p_buyer_last_name) = '' then
    raise exception 'El apellido del comprador es obligatorio';
  end if;
  if p_buyer_dni is null or btrim(p_buyer_dni) = '' then
    raise exception 'El DNI del comprador es obligatorio';
  end if;
  if p_buyer_phone is null or btrim(p_buyer_phone) = '' then
    raise exception 'El WhatsApp del comprador es obligatorio';
  end if;

  select bt.name, coalesce(bt.price_minor, 0), bt.status into v_name, v_price, v_status
  from public.bar_tables bt
  where bt.id = p_table_id and bt.event_id = p_event_id
  for update;

  if not found then
    raise exception 'La mesa no existe para este evento';
  end if;
  if v_price <= 0 then
    raise exception 'Esta mesa no se puede reservar online';
  end if;
  if v_status <> 'available' then
    raise exception 'Esa mesa ya no esta disponible';
  end if;

  insert into public.buyers (organization_id, first_name, last_name, dni, phone, email)
  values (v_org_id, btrim(p_buyer_first_name), btrim(p_buyer_last_name), btrim(p_buyer_dni), btrim(p_buyer_phone), nullif(btrim(coalesce(p_buyer_email, '')), ''))
  returning id into v_buyer_id;

  insert into public.sales (organization_id, event_id, buyer_id, seller_member_id, status, total_minor, currency, channel, table_id)
  values (v_org_id, p_event_id, v_buyer_id, null, 'pending_approval', v_price, 'ARS', 'online', p_table_id)
  returning id into v_sale_id;

  update public.bar_tables set status = 'reserved' where id = p_table_id;

  return query select v_sale_id, v_buyer_id, v_price, v_name;
end;
$function$;

revoke all on function public.create_online_table_sale(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_online_table_sale(uuid, uuid, text, text, text, text, text) to service_role;

commit;

notify pgrst, 'reload schema';
