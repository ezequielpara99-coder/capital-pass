-- Bug real encontrado en revision: ni create_bartender_sale ni
-- redeem_combo_ticket tenian ninguna forma de detectar un reintento del
-- mismo pedido. Si el bartender ya cobro un trago en efectivo, aprieta
-- "Confirmar venta", el servidor la registra y descuenta stock, pero la
-- respuesta se pierde por un corte de wifi (tipico en el fondo de una
-- barra durante un evento) -- el bartender ve un error generico y vuelve
-- a apretar el mismo boton, generando una venta y un descuento de stock
-- DUPLICADOS, aunque cobro una sola vez. Mismo riesgo en el canje de
-- combo. Esto agrega una idempotency key opcional (un UUID que el cliente
-- genera una sola vez por intento de venta y reenvia igual en cada
-- reintento): si ya existe una fila con esa clave, se devuelve el
-- resultado de la venta original en vez de crear una nueva.
begin;

alter table public.bar_sales add column if not exists idempotency_key uuid;
create unique index if not exists bar_sales_idempotency_key_uidx on public.bar_sales (idempotency_key) where idempotency_key is not null;

create or replace function public.create_bartender_sale(
  p_bar_id uuid, p_table_id uuid, p_event_product_id uuid, p_quantity integer, p_payment_method text,
  p_idempotency_key uuid default null
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
  v_existing_total bigint;
begin
  if p_idempotency_key is not null then
    select bs.id, bs.total_minor into v_sale_id, v_existing_total
    from public.bar_sales bs where bs.idempotency_key = p_idempotency_key;
    if found then
      return query select v_sale_id, v_existing_total;
      return;
    end if;
  end if;

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

  if not exists (
    select 1 from public.bar_stock where bar_id = p_bar_id and event_product_id = p_event_product_id
  ) then
    raise exception 'Este producto no esta asignado a esta barra';
  end if;

  v_total := v_sale_price * p_quantity;

  insert into public.bar_sales (event_id, bar_id, bartender_member_id, table_id, event_product_id, quantity, unit_price_minor, total_minor, payment_method, idempotency_key)
  values (v_event_id, p_bar_id, v_bartender_member_id, p_table_id, p_event_product_id, p_quantity, v_sale_price, v_total, v_payment_method, p_idempotency_key)
  returning id into v_sale_id;

  insert into public.stock_movements (event_id, event_product_id, bar_id, type, quantity, actor_user_id)
  values (v_event_id, p_event_product_id, p_bar_id, 'venta', p_quantity, auth.uid());

  return query select v_sale_id, v_total;
end;
$$;
revoke all on function public.create_bartender_sale(uuid, uuid, uuid, integer, text, uuid) from public, anon;
grant execute on function public.create_bartender_sale(uuid, uuid, uuid, integer, text, uuid) to authenticated;
drop function if exists public.create_bartender_sale(uuid, uuid, uuid, integer, text);

create or replace function public.redeem_combo_ticket(
  p_bar_id uuid, p_manual_code text, p_event_product_id uuid, p_quantity integer,
  p_idempotency_key uuid default null
)
returns table(
  ticket_id uuid, product_name text, quantity integer,
  remaining_quantity integer, remaining_credit_minor bigint,
  buyer_name text
)
language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_organization_id uuid;
  v_bartender_member_id uuid;
  v_code text;
  v_ticket_row_id uuid;
  v_ticket_status public.ticket_status;
  v_combo_type text;
  v_combo_event_product_id uuid;
  v_remaining_quantity integer;
  v_remaining_credit_minor bigint;
  v_buyer_name text;
  v_bar_stock integer;
  v_sale_price bigint;
  v_product_name text;
  v_cost bigint;
  v_bar_sale_id uuid;
  v_existing_ticket_id uuid;
begin
  if p_idempotency_key is not null then
    select bs.ticket_id into v_existing_ticket_id
    from public.bar_sales bs where bs.idempotency_key = p_idempotency_key;
    if found then
      select p.name, t.combo_remaining_quantity, t.combo_remaining_credit_minor,
        b.first_name || ' ' || b.last_name
      into v_product_name, v_remaining_quantity, v_remaining_credit_minor, v_buyer_name
      from public.tickets t
      join public.ticket_types tt on tt.id = t.ticket_type_id
      join public.sales s on s.id = t.sale_id
      join public.buyers b on b.id = s.buyer_id
      join public.event_products ep on ep.id = p_event_product_id
      join public.products p on p.id = ep.product_id
      where t.id = v_existing_ticket_id;

      return query select v_existing_ticket_id, v_product_name, p_quantity, v_remaining_quantity, v_remaining_credit_minor, v_buyer_name;
      return;
    end if;
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity > 20 then
    raise exception 'Cantidad invalida';
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

  v_code := upper(btrim(p_manual_code));
  if v_code = '' then
    raise exception 'Ingresa el codigo de la entrada';
  end if;

  select t.id, t.status, tt.combo_type, tt.combo_event_product_id,
    t.combo_remaining_quantity, t.combo_remaining_credit_minor,
    b.first_name || ' ' || b.last_name
  into v_ticket_row_id, v_ticket_status, v_combo_type, v_combo_event_product_id,
    v_remaining_quantity, v_remaining_credit_minor, v_buyer_name
  from public.tickets t
  join public.ticket_types tt on tt.id = t.ticket_type_id
  join public.sales s on s.id = t.sale_id
  join public.buyers b on b.id = s.buyer_id
  where t.event_id = v_event_id and upper(t.manual_code) = v_code
  for update of t;

  if not found then
    raise exception 'No se encontro ninguna entrada con ese codigo';
  end if;
  if v_ticket_status = 'cancelled' then
    raise exception 'Esta entrada fue anulada';
  end if;
  if v_combo_type is null then
    raise exception 'Esta entrada no incluye consumicion';
  end if;

  select ep.sale_price_minor, p.name into v_sale_price, v_product_name
  from public.event_products ep
  join public.products p on p.id = ep.product_id
  where ep.id = p_event_product_id and ep.event_id = v_event_id;
  if not found then
    raise exception 'El producto no existe para este evento';
  end if;

  if v_combo_type = 'producto' then
    if p_event_product_id <> v_combo_event_product_id then
      raise exception 'Esta entrada no incluye ese producto';
    end if;
    if coalesce(v_remaining_quantity, 0) < p_quantity then
      raise exception 'Ya se canjeo todo lo incluido en esta entrada. Quedan: %', coalesce(v_remaining_quantity, 0);
    end if;
  else
    v_cost := v_sale_price * p_quantity;
    if coalesce(v_remaining_credit_minor, 0) < v_cost then
      raise exception 'No queda suficiente credito en esta entrada. Quedan: %', coalesce(v_remaining_credit_minor, 0);
    end if;
  end if;

  select bar_stock.quantity into v_bar_stock from public.bar_stock
  where bar_id = p_bar_id and event_product_id = p_event_product_id
  for update;
  if not found or v_bar_stock < p_quantity then
    raise exception 'No hay suficiente stock en esta barra. Disponible: %', coalesce(v_bar_stock, 0);
  end if;

  update public.bar_stock set quantity = bar_stock.quantity - p_quantity, updated_at = now()
  where bar_id = p_bar_id and event_product_id = p_event_product_id;

  if v_combo_type = 'producto' then
    update public.tickets set combo_remaining_quantity = combo_remaining_quantity - p_quantity, updated_at = now()
    where id = v_ticket_row_id
    returning combo_remaining_quantity, combo_remaining_credit_minor into v_remaining_quantity, v_remaining_credit_minor;
  else
    update public.tickets set combo_remaining_credit_minor = combo_remaining_credit_minor - v_cost, updated_at = now()
    where id = v_ticket_row_id
    returning combo_remaining_quantity, combo_remaining_credit_minor into v_remaining_quantity, v_remaining_credit_minor;
  end if;

  insert into public.bar_sales (event_id, bar_id, bartender_member_id, table_id, event_product_id, quantity, unit_price_minor, total_minor, payment_method, ticket_id, idempotency_key)
  values (v_event_id, p_bar_id, v_bartender_member_id, null, p_event_product_id, p_quantity, v_sale_price, v_sale_price * p_quantity, 'combo', v_ticket_row_id, p_idempotency_key)
  returning id into v_bar_sale_id;

  insert into public.stock_movements (event_id, event_product_id, bar_id, type, quantity, actor_user_id)
  values (v_event_id, p_event_product_id, p_bar_id, 'venta', p_quantity, auth.uid());

  return query select v_ticket_row_id, v_product_name, p_quantity, v_remaining_quantity, v_remaining_credit_minor, v_buyer_name;
end;
$$;
revoke all on function public.redeem_combo_ticket(uuid, text, uuid, integer, uuid) from public, anon;
grant execute on function public.redeem_combo_ticket(uuid, text, uuid, integer, uuid) to authenticated;
drop function if exists public.redeem_combo_ticket(uuid, text, uuid, integer);

commit;

notify pgrst, 'reload schema';
