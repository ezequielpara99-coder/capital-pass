-- Dos bugs criticos encontrados en la ronda de auditoria del checkout publico:
--
-- 1. process_ticket_return quedo sin el grant a "authenticated" desde
--    20261002_qr_de_mesa.sql (se copio el revoke/grant de otra funcion del
--    mismo archivo, pensada para llamarse solo con service_role, y se
--    piso el grant que esta funcion siempre tuvo desde 20260962). La ruta
--    del panel que la llama (app/api/entradas/devolver/route.ts) usa la
--    sesion del organizador (rol "authenticated"), asi que TODA devolucion
--    de entradas quedo rota con "permission denied" desde que se corrio esa
--    migracion -- la logica de negocio del RPC nunca fue el problema, era
--    el permiso.
--
-- 2. confirm_online_sale, al recibir un pago sobre una venta YA confirmada,
--    trataba CUALQUIER estado que no fuera "todavia pendiente" como un
--    reembolso/contracargo real -- incluido 'rejected'/'cancelled'. Pero un
--    pago rechazado no es lo mismo que un reembolso: es un INTENTO DE PAGO
--    DISTINTO para la misma venta (ej. el comprador probo primero con una
--    tarjeta que rechazo, y volvio a pagar con otra que si aprobo).
--    Mercado Pago notifica cada intento por separado y sin garantia de
--    orden -- si la notificacion del intento rechazado llega DESPUES de
--    que el intento aprobado ya confirmo la venta (emitio las entradas y
--    mando el mail con el QR), esta funcion anulaba esas entradas ya
--    entregadas y marcaba la venta como "refunded" sin que se haya
--    devuelto un peso real. Mismo patron que ya usa
--    member_wallet_topup_apply (20260984) para la recarga de saldo: una
--    vez que algo esta "approved", solo 'refunded'/'charged_back' (un
--    reembolso/contracargo real sobre ESE MISMO pago) lo puede revertir --
--    'rejected'/'cancelled' ya no aplican, son el resultado de un intento
--    distinto que perdio la carrera contra el que si se acredito.
begin;

grant execute on function public.process_ticket_return(uuid, text, text, bigint) to authenticated;

create or replace function public.confirm_online_sale(p_sale_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_sale public.sales%rowtype;
  v_item record;
  v_sold integer;
  v_capacity integer;
  v_event_status public.event_status;
  v_tt_active boolean;
  v_tt_status public.ticket_type_status;
begin
  select * into v_sale from public.sales where id = p_sale_id and channel = 'online' for update;
  if not found then
    raise exception 'Venta online inexistente';
  end if;

  -- Idempotente: un reintento del webhook no debe duplicar entradas ni
  -- volver a procesar una venta ya confirmada. Solo un reembolso o
  -- contracargo REAL ('refunded'/'charged_back') sobre esta MISMA venta ya
  -- confirmada anula las entradas -- cualquier otro estado (por ejemplo
  -- 'rejected'/'cancelled' de un intento de pago distinto que llego tarde)
  -- se ignora sin tocar nada, la venta ya esta resuelta por el pago que SI
  -- se acredito.
  if v_sale.status = 'confirmed' then
    if p_status in ('refunded', 'charged_back') then
      update public.tickets set status = 'cancelled', cancelled_at = now(), updated_at = now()
      where sale_id = p_sale_id and status = 'issued';

      update public.sales set status = 'refunded', updated_at = now() where id = p_sale_id;

      for v_item in select distinct ticket_type_id from public.sale_items where sale_id = p_sale_id loop
        select capacity into v_capacity from public.ticket_types where id = v_item.ticket_type_id for update;
        select count(*)::integer into v_sold from public.tickets t
        where t.ticket_type_id = v_item.ticket_type_id and t.status <> 'cancelled';
        if v_sold < v_capacity then
          update public.ticket_types set status = 'available', updated_at = now()
          where id = v_item.ticket_type_id and status = 'sold_out';
        end if;
      end loop;
    end if;
    return;
  end if;

  -- Se procesa desde 'pending_approval' (caso normal) o 'cancelled' (el
  -- cron de 30 minutos ya la habia vencido, pero el pago aprobado llego
  -- despues -- tipico de un pago en efectivo). Cualquier otro estado no
  -- se toca.
  if v_sale.status not in ('pending_approval', 'cancelled') then
    return;
  end if;

  if p_status in ('pending', 'in_process', 'in_mediation', 'authorized') then
    -- Todavia no hay una decision final. No tocamos la venta -- ni
    -- siquiera si ya estaba 'cancelled' por el cron, para no revivirla
    -- con un estado que todavia no es definitivo.
    return;
  end if;

  if p_status <> 'approved' then
    if v_sale.status = 'pending_approval' then
      update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;
    end if;
    return;
  end if;

  -- Pago aprobado: create_online_sale/create_online_table_sale ya
  -- validaron el evento al armar el carrito, pero este pago puede llegar
  -- mucho despues (pago en efectivo, reintento de Mercado Pago) -- si el
  -- organizador cancelo el evento mientras tanto, no hay que emitir
  -- entradas para el igual solo porque el cupo todavia daba.
  select status into v_event_status from public.events where id = v_sale.event_id;
  if v_event_status not in ('upcoming', 'active') then
    update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;
    raise warning 'confirm_online_sale: el evento ya no esta activo, venta % quedo cancelada -- requiere reintegro manual', p_sale_id;
    return;
  end if;

  -- Re-verificamos cupo Y que la tanda siga activa/disponible, con lock,
  -- por cada TANDA distinta del carrito (agrupando sale_items que
  -- comparten ticket_type_id, para no subestimar cuanto pide esta venta)
  -- antes de confirmar nada -- tanto en el camino normal como al revivir
  -- una venta que el cron ya habia cancelado. El lock se toma ANTES de
  -- contar cuantas entradas ya hay vendidas: si no, dos confirmaciones
  -- simultaneas para la misma tanda pueden leer las dos el mismo conteo
  -- desactualizado mientras esperan el lock, y sobrevender.
  for v_item in
    select ticket_type_id, sum(quantity)::integer as total_quantity
    from public.sale_items
    where sale_id = p_sale_id
    group by ticket_type_id
  loop
    select capacity, active, status into v_capacity, v_tt_active, v_tt_status
    from public.ticket_types where id = v_item.ticket_type_id for update;

    if v_tt_active = false or v_tt_status = 'paused' then
      update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;
      raise warning 'confirm_online_sale: la tanda ya no esta disponible, venta % quedo cancelada -- requiere reintegro manual', p_sale_id;
      return;
    end if;

    select count(*)::integer into v_sold from public.tickets t
    where t.ticket_type_id = v_item.ticket_type_id and t.status <> 'cancelled';

    if v_sold + v_item.total_quantity > v_capacity then
      update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;
      raise warning 'confirm_online_sale: pago aprobado sin cupo disponible, venta % quedo cancelada -- requiere reintegro manual', p_sale_id;
      return;
    end if;
  end loop;

  update public.sales set status = 'confirmed', confirmed_at = now(), updated_at = now() where id = p_sale_id;

  for v_item in select * from public.sale_items where sale_id = p_sale_id loop
    insert into public.tickets (sale_item_id, sale_id, event_id, ticket_type_id, status, combo_type, combo_event_product_id, combo_remaining_quantity, combo_remaining_credit_minor)
    select v_item.id, p_sale_id, v_item.event_id, v_item.ticket_type_id, 'issued', v_item.combo_type, v_item.combo_event_product_id, v_item.combo_quantity, v_item.combo_credit_minor
    from generate_series(1, v_item.quantity);

    select count(*)::integer into v_sold from public.tickets t
    where t.ticket_type_id = v_item.ticket_type_id and t.status <> 'cancelled';

    select capacity into v_capacity from public.ticket_types where id = v_item.ticket_type_id;

    if v_sold >= v_capacity then
      update public.ticket_types set status = 'sold_out', updated_at = now() where id = v_item.ticket_type_id;
    end if;
  end loop;

  -- Venta de mesa (sin sale_items, el loop de arriba no crea nada): un
  -- unico ticket para la mesa, sin ticket_type_id -- se identifica por
  -- sales.table_id via join, no por una tanda con cupo.
  if v_sale.table_id is not null then
    insert into public.tickets (sale_id, event_id, status)
    values (p_sale_id, v_sale.event_id, 'issued');
  end if;
end;
$$;
revoke all on function public.confirm_online_sale(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_online_sale(uuid, text) to service_role;

commit;

notify pgrst, 'reload schema';
