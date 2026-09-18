-- Vender un trago suelto ya NO descuenta bar_stock en tiempo real: no hay
-- forma de saber cuanto le queda realmente a una botella hasta que el
-- bartender la termine y el organizador haga el conteo fisico al cierre
-- (Cierre de noche, que ya existe). Solo el canje de un combo (que entrega
-- una cantidad fija y conocida) sigue descontando stock al momento.
--
-- La plata recaudada y "que barra vendio mas" no dependen del stock -- ya
-- se calculan a partir de bar_sales en /api/stock/reports, asi que no
-- cambian con esto. Lo que si cambia es que "Esperado (sistema)" en Cierre
-- de noche deja de bajar con cada trago vendido: ahora la diferencia contra
-- el conteo fisico representa lo realmente consumido en tragos.
begin;

create or replace function public.create_bartender_sale(
  p_bar_id uuid, p_table_id uuid, p_event_product_id uuid, p_quantity integer, p_payment_method text
)
returns table(bar_sale_id uuid, total_minor bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_organization_id uuid;
  v_bartender_member_id uuid;
  v_sale_price bigint;
  v_total bigint;
  v_payment_method public.sale_payment_method;
  v_sale_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity > 50 then
    raise exception 'Cantidad invalida';
  end if;

  begin
    v_payment_method := p_payment_method::public.sale_payment_method;
  exception when invalid_text_representation then
    raise exception 'Indica si la venta fue en efectivo o transferencia';
  end;

  select b.event_id, e.organization_id into v_event_id, v_organization_id
  from public.bars b join public.events e on e.id = b.event_id
  where b.id = p_bar_id;

  if not found then
    raise exception 'La barra no existe';
  end if;

  if not public.cp_org_has_service(v_organization_id) then
    raise exception 'La organizacion necesita una suscripcion activa.';
  end if;

  -- El bartender solo puede vender desde SU barra asignada.
  select om.id into v_bartender_member_id
  from public.organization_members om
  join public.event_staff es on es.organization_member_id = om.id
  where om.organization_id = v_organization_id and om.user_id = auth.uid()
    and om.role = 'bartender' and om.status = 'active'
    and es.event_id = v_event_id and es.staff_role = 'bartender' and es.active = true
    and es.bar_id = p_bar_id
  limit 1;

  if v_bartender_member_id is null then
    raise exception 'No estas asignado a esta barra';
  end if;

  -- La mesa es opcional: si se indica, tiene que existir en el evento.
  if p_table_id is not null and not exists (
    select 1 from public.bar_tables t where t.id = p_table_id and t.event_id = v_event_id
  ) then
    raise exception 'La mesa no existe para este evento';
  end if;

  select ep.sale_price_minor into v_sale_price
  from public.event_products ep where ep.id = p_event_product_id and ep.event_id = v_event_id;

  if not found then
    raise exception 'El producto no existe para este evento';
  end if;

  -- Solo confirmamos que el producto este asignado a esta barra (aunque
  -- sea con cantidad 0) -- no bloqueamos por cantidad, porque vender un
  -- trago ya no descuenta este numero.
  if not exists (
    select 1 from public.bar_stock where bar_id = p_bar_id and event_product_id = p_event_product_id
  ) then
    raise exception 'Este producto no esta asignado a esta barra';
  end if;

  v_total := v_sale_price * p_quantity;

  insert into public.bar_sales (event_id, bar_id, bartender_member_id, table_id, event_product_id, quantity, unit_price_minor, total_minor, payment_method)
  values (v_event_id, p_bar_id, v_bartender_member_id, p_table_id, p_event_product_id, p_quantity, v_sale_price, v_total, v_payment_method)
  returning id into v_sale_id;

  insert into public.stock_movements (event_id, event_product_id, bar_id, type, quantity, actor_user_id)
  values (v_event_id, p_event_product_id, p_bar_id, 'venta', p_quantity, auth.uid());

  return query select v_sale_id, v_total;
end;
$$;
revoke all on function public.create_bartender_sale(uuid, uuid, uuid, integer, text) from public, anon;
grant execute on function public.create_bartender_sale(uuid, uuid, uuid, integer, text) to authenticated;

-- cancel_bar_sale restauraba stock para CUALQUIER venta cancelada,
-- asumiendo que todas habian descontado bar_stock al venderse. Ahora eso
-- solo es cierto para los canjes de combo (payment_method='combo') --
-- cancelar un trago suelto ya no debe "inventar" stock que nunca se
-- descargo.
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

  if v_sale.payment_method = 'combo' then
    update public.bar_stock set quantity = quantity + v_sale.quantity, updated_at = now()
    where bar_id = v_sale.bar_id and event_product_id = v_sale.event_product_id;

    insert into public.stock_movements (event_id, event_product_id, bar_id, type, quantity, reason, actor_user_id)
    values (v_sale.event_id, v_sale.event_product_id, v_sale.bar_id, 'ajuste', v_sale.quantity, 'Cancelacion de venta: ' || p_reason, auth.uid());
  end if;
end;
$$;
revoke all on function public.cancel_bar_sale(uuid, text) from public, anon;
grant execute on function public.cancel_bar_sale(uuid, text) to authenticated;

commit;
