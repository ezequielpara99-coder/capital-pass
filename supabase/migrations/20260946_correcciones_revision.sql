-- Tres bugs reales encontrados en una revision general del codigo:
--
-- 1. confirm_online_sale: el chequeo de cupo leia "cuantas entradas ya hay
--    vendidas" (v_sold) ANTES de tomar el lock "for update" sobre la tanda.
--    Con "read committed" (el nivel por defecto), dos confirmaciones casi
--    simultaneas para la misma tanda pueden leer las dos el mismo v_sold
--    desactualizado mientras esperan el lock, y las dos pasar el chequeo de
--    cupo -- sobrevendiendo una tanda ya agotada. Se soluciona tomando el
--    lock ANTES de contar.
--
-- 2. confirm_online_sale: si Mercado Pago avisa un reembolso o contracargo
--    DESPUES de que la venta ya quedo "confirmed" (entradas ya emitidas), la
--    funcion no hacia nada -- el comprador se quedaba con entradas validas
--    para un pago que ya se le devolvio. Ahora anula esas entradas y libera
--    el cupo si la tanda habia quedado agotada.
--
-- 3. cp_apply_upgrade_payment: una vez que un cobro de actualizacion de plan
--    quedaba "approved", cualquier aviso posterior (reembolso, contracargo)
--    sobre ESE MISMO pago se ignoraba silenciosamente -- la organizacion se
--    quedaba con el plan pago para siempre aunque Mercado Pago le haya
--    devuelto la plata. Ahora, si el mismo pago se reporta reembolsado, el
--    cargo pasa a "rejected" y el acceso se revoca (cp_org_has_stock_access
--    ya lo recalcula en vivo contra este status).
--
-- 4. adjust_bar_stock: no validaba que el producto ajustado perteneciera al
--    mismo evento que la barra (permitia mezclar stock entre eventos/
--    organizaciones distintas), y el tope de "no repartir mas stock entre
--    barras del que se compro" se calculaba sin ningun lock que serializara
--    ajustes concurrentes en barras distintas del mismo producto -- dos
--    ajustes positivos simultaneos podian superar el total comprado (el
--    mismo bug que la migracion 20260933 dijo haber arreglado, reintroducido
--    por el orden de las operaciones). Se arregla igual que
--    assign_stock_to_bar: bloqueando la fila de event_products primero.
begin;

-- Nuevo estado para una venta online que se confirmo y despues se
-- reembolso/contracargo (antes el enum solo tenia 'confirmed',
-- 'pending_approval' y 'cancelled', asi que no habia forma de distinguir
-- una venta reembolsada de una recien confirmada).
alter type public.sale_status add value if not exists 'refunded';

-- Ya existe en produccion (se agrego a mano hace tiempo, igual que
-- combo_remaining_quantity en 20260934); la dejamos explicita aca porque
-- confirm_online_sale ahora la usa para anular entradas ante un reembolso.
alter table public.tickets add column if not exists cancelled_at timestamptz;

create or replace function public.confirm_online_sale(p_sale_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_sale public.sales%rowtype;
  v_item record;
  v_sold integer;
  v_capacity integer;
begin
  select * into v_sale from public.sales where id = p_sale_id and channel = 'online' for update;
  if not found then
    raise exception 'Venta online inexistente';
  end if;

  -- Idempotente: un reintento del webhook no debe duplicar entradas ni
  -- volver a procesar una venta ya confirmada. Pero si lo que llega ahora
  -- es un reembolso/contracargo sobre esta MISMA venta ya confirmada, hay
  -- que anular las entradas en vez de ignorarlo.
  if v_sale.status = 'confirmed' then
    if p_status not in ('approved', 'pending', 'in_process', 'in_mediation', 'authorized') then
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

  -- Pago aprobado: re-verificamos cupo con lock por cada tanda del
  -- carrito antes de confirmar nada -- tanto en el camino normal como al
  -- revivir una venta que el cron ya habia cancelado. El lock se toma
  -- ANTES de contar cuantas entradas ya hay vendidas: si no, dos
  -- confirmaciones simultaneas para la misma tanda pueden leer las dos el
  -- mismo conteo desactualizado mientras esperan el lock, y sobrevender.
  for v_item in select * from public.sale_items where sale_id = p_sale_id loop
    select capacity into v_capacity from public.ticket_types where id = v_item.ticket_type_id for update;

    select count(*)::integer into v_sold from public.tickets t
    where t.ticket_type_id = v_item.ticket_type_id and t.status <> 'cancelled';

    if v_sold + v_item.quantity > v_capacity then
      update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;
      raise warning 'confirm_online_sale: pago aprobado sin cupo disponible, venta % quedo cancelada -- requiere reintegro manual', p_sale_id;
      return;
    end if;
  end loop;

  update public.sales set status = 'confirmed', confirmed_at = now(), updated_at = now() where id = p_sale_id;

  for v_item in select * from public.sale_items where sale_id = p_sale_id loop
    insert into public.tickets (sale_item_id, sale_id, event_id, ticket_type_id, status, combo_remaining_quantity, combo_remaining_credit_minor)
    select v_item.id, p_sale_id, v_item.event_id, v_item.ticket_type_id, 'issued', v_item.combo_quantity, v_item.combo_credit_minor
    from generate_series(1, v_item.quantity);

    select count(*)::integer into v_sold from public.tickets t
    where t.ticket_type_id = v_item.ticket_type_id and t.status <> 'cancelled';

    select capacity into v_capacity from public.ticket_types where id = v_item.ticket_type_id;

    if v_sold >= v_capacity then
      update public.ticket_types set status = 'sold_out', updated_at = now() where id = v_item.ticket_type_id;
    end if;
  end loop;
end;
$$;
revoke all on function public.confirm_online_sale(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_online_sale(uuid, text) to service_role;

create or replace function public.cp_apply_upgrade_payment(
  p_charge_id uuid, p_payment_id text, p_status text, p_amount numeric, p_currency text, p_paid_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.plan_upgrade_charges%rowtype;
begin
  select * into c from public.plan_upgrade_charges where id = p_charge_id for update;
  if not found then raise exception 'No se encontró el cobro de actualización.'; end if;

  if c.status = 'approved' then
    if p_status = 'approved' then
      return; -- reintento idempotente del mismo resultado
    end if;
    if p_payment_id is distinct from c.mercadopago_payment_id then
      -- Un aviso de un pago distinto no puede revertir un cargo que ya
      -- se aprobo con otro pago.
      return;
    end if;
    -- El MISMO pago que ya estaba aprobado ahora se reporta
    -- reembolsado/con contracargo: revertimos el acceso otorgado (antes
    -- quedaba 'approved' para siempre sin importar reembolsos posteriores).
    update public.plan_upgrade_charges set status = 'rejected' where id = p_charge_id;
    return;
  end if;

  if p_amount <> c.amount_minor or p_currency <> c.currency then
    raise exception 'El cobro no coincide con la actualización solicitada.';
  end if;

  update public.plan_upgrade_charges set
    status = case when p_status = 'approved' then 'approved' else 'rejected' end,
    mercadopago_payment_id = p_payment_id,
    paid_at = case when p_status = 'approved' then p_paid_at else null end
  where id = p_charge_id;
end;
$$;
revoke all on function public.cp_apply_upgrade_payment(uuid, text, text, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.cp_apply_upgrade_payment(uuid, text, text, numeric, text, timestamptz) to service_role;

create or replace function public.adjust_bar_stock(
  p_bar_id uuid, p_event_product_id uuid, p_quantity_delta integer, p_type text, p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_organization_id uuid;
  v_current integer;
  v_movement_type public.stock_movement_type;
  v_total_stock integer;
  v_total_across_bars integer;
  v_product_event_id uuid;
begin
  if p_type not in ('ajuste', 'perdida') then
    raise exception 'Tipo de movimiento invalido';
  end if;
  v_movement_type := p_type::public.stock_movement_type;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Indica el motivo del ajuste';
  end if;

  if p_quantity_delta = 0 then
    raise exception 'La cantidad no puede ser cero';
  end if;

  select b.event_id, e.organization_id into v_event_id, v_organization_id
  from public.bars b join public.events e on e.id = b.event_id
  where b.id = p_bar_id;

  if not found then
    raise exception 'La barra no existe';
  end if;

  if not public.is_platform_admin() and not public.cp_org_has_stock_access(v_organization_id) then
    raise exception 'La organizacion no tiene acceso al modulo de stock.';
  end if;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = v_organization_id and om.user_id = auth.uid()
      and om.role = 'organizer' and om.status = 'active'
  ) then
    raise exception 'No tenes permiso para administrar el stock de este evento';
  end if;

  -- El producto tiene que pertenecer al MISMO evento que la barra (antes no
  -- se validaba, permitiendo ajustar stock de un producto de otro evento u
  -- organizacion). El "for update of ep" ademas bloquea la fila del
  -- producto y sirve para serializar ajustes positivos concurrentes en
  -- barras distintas del mismo producto -- si no, dos ajustes simultaneos
  -- pueden leer el mismo total repartido y superar juntos el stock comprado.
  select ep.event_id, ep.total_stock into v_product_event_id, v_total_stock
  from public.event_products ep where ep.id = p_event_product_id for update of ep;

  if not found or v_product_event_id <> v_event_id then
    raise exception 'El producto no pertenece a este evento';
  end if;

  if p_quantity_delta > 0 then
    select coalesce(sum(quantity), 0) into v_total_across_bars
    from public.bar_stock where event_product_id = p_event_product_id;

    if v_total_across_bars + p_quantity_delta > v_total_stock then
      raise exception 'El ajuste superaria el stock total comprado (%). Ya hay % repartido en barras.', v_total_stock, v_total_across_bars;
    end if;
  end if;

  select quantity into v_current from public.bar_stock
  where bar_id = p_bar_id and event_product_id = p_event_product_id
  for update;

  if not found then
    v_current := 0;
    insert into public.bar_stock (bar_id, event_product_id, quantity) values (p_bar_id, p_event_product_id, 0);
  end if;

  if v_current + p_quantity_delta < 0 then
    raise exception 'El ajuste dejaria el stock en negativo. Stock actual: %', v_current;
  end if;

  update public.bar_stock set quantity = v_current + p_quantity_delta, updated_at = now()
  where bar_id = p_bar_id and event_product_id = p_event_product_id;

  insert into public.stock_movements (event_id, event_product_id, bar_id, type, quantity, reason, actor_user_id)
  values (v_event_id, p_event_product_id, p_bar_id, v_movement_type, abs(p_quantity_delta), p_reason, auth.uid());
end;
$$;
revoke all on function public.adjust_bar_stock(uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.adjust_bar_stock(uuid, uuid, integer, text, text) to authenticated;

commit;
