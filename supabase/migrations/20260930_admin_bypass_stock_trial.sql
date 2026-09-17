-- El admin de la plataforma no debe quedar bloqueado por la prueba/plan
-- de stock de ninguna organizacion (soporte, demos, pruebas). sell_table
-- ya tenia este bypass; assign_stock_to_bar, adjust_bar_stock y
-- create_bartender_sale se habian quedado sin el por inconsistencia.
begin;

create or replace function public.assign_stock_to_bar(
  p_event_product_id uuid, p_bar_id uuid, p_quantity integer
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_organization_id uuid;
  v_total_stock integer;
  v_already_assigned integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  select ep.event_id, ep.total_stock, e.organization_id
  into v_event_id, v_total_stock, v_organization_id
  from public.event_products ep
  join public.events e on e.id = ep.event_id
  where ep.id = p_event_product_id
  for update of ep;

  if not found then
    raise exception 'El producto no existe para este evento';
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

  if not exists (select 1 from public.bars b where b.id = p_bar_id and b.event_id = v_event_id) then
    raise exception 'La barra no existe para este evento';
  end if;

  select coalesce(sum(quantity), 0) into v_already_assigned
  from public.stock_movements
  where event_product_id = p_event_product_id and type = 'asignacion_barra';

  if v_already_assigned + p_quantity > v_total_stock then
    raise exception 'No hay suficiente stock general disponible. Disponible: %', greatest(v_total_stock - v_already_assigned, 0);
  end if;

  insert into public.bar_stock (bar_id, event_product_id, quantity)
  values (p_bar_id, p_event_product_id, p_quantity)
  on conflict (bar_id, event_product_id)
  do update set quantity = public.bar_stock.quantity + excluded.quantity, updated_at = now();

  insert into public.stock_movements (event_id, event_product_id, bar_id, type, quantity, actor_user_id)
  values (v_event_id, p_event_product_id, p_bar_id, 'asignacion_barra', p_quantity, auth.uid());
end;
$$;
revoke all on function public.assign_stock_to_bar(uuid, uuid, integer) from public, anon;
grant execute on function public.assign_stock_to_bar(uuid, uuid, integer) to authenticated;

create or replace function public.adjust_bar_stock(
  p_bar_id uuid, p_event_product_id uuid, p_quantity_delta integer, p_type text, p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_organization_id uuid;
  v_current integer;
  v_movement_type public.stock_movement_type;
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

create or replace function public.create_bartender_sale(
  p_bar_id uuid, p_table_id uuid, p_event_product_id uuid, p_quantity integer, p_payment_method text
)
returns table(bar_sale_id uuid, total_minor bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_organization_id uuid;
  v_bartender_member_id uuid;
  v_current_stock integer;
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

  if not public.is_platform_admin() and not public.cp_org_has_stock_access(v_organization_id) then
    raise exception 'La organizacion no tiene acceso al modulo de stock.';
  end if;

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

  select quantity into v_current_stock from public.bar_stock
  where bar_id = p_bar_id and event_product_id = p_event_product_id
  for update;

  if not found or v_current_stock < p_quantity then
    raise exception 'No hay suficiente stock en esta barra. Disponible: %', coalesce(v_current_stock, 0);
  end if;

  update public.bar_stock set quantity = quantity - p_quantity, updated_at = now()
  where bar_id = p_bar_id and event_product_id = p_event_product_id;

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

commit;
