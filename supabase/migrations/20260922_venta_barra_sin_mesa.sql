-- =============================================================
-- Permite que el bartender venda sin atarse a una mesa (venta de
-- mostrador/barra para un cliente que no esta sentado en una mesa).
-- =============================================================

alter table public.bar_sales alter column table_id drop not null;

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
