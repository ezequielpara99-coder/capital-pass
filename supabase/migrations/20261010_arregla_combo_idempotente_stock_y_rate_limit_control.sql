-- Tres bugs reales de dos rondas de auditoria (barra/stock y puerta/control):
--
-- 1. redeem_combo_ticket, en su rama idempotente (reintento con la misma
--    idempotency_key), armaba la respuesta buscando el producto por
--    p_event_product_id/p_quantity del REQUEST NUEVO en vez de lo que
--    realmente se descarto/canjeo la primera vez (guardado en la fila de
--    bar_sales original). Si el reintento llegaba con un producto o
--    cantidad distinta (bug de UI, doble tap con otra bebida seleccionada
--    antes de que el primer pedido terminara), no habia doble descuento
--    de stock (la logica de negocio ya habia corrido y persistido bien la
--    primera vez), pero el recibo mostrado al bartender podia decir un
--    producto/cantidad que NO son los que realmente se entregaron.
--
-- 2. assign_stock_to_bar median "cuanto ya se repartio" sumando el
--    HISTORICO completo de stock_movements tipo 'asignacion_barra' (un
--    numero que solo crece), mientras que cp_upsert_event_product (para
--    decidir si se puede bajar el total_stock) usa la suma EN VIVO de
--    bar_stock.quantity (que si baja cuando se consume/pierde stock). Un
--    organizador que bajaba el total_stock confiando en el numero en vivo
--    podia dejar el producto con mas "ya asignado" (segun el historico)
--    que el nuevo total, bloqueando cualquier asignacion futura con un
--    error de "no hay suficiente stock" aunque en la realidad si hubiera
--    margen. Se unifica: assign_stock_to_bar ahora usa la misma suma en
--    vivo de bar_stock.quantity.
--
-- 3. validate_ticket_manual (compartida por el escaneo de QR y el codigo
--    manual) no tenia ningun limite de intentos propio -- el camino QR se
--    protege con checkRateLimit en la API route (validar-qr/route.ts),
--    pero el codigo manual se llama DIRECTO por RPC desde el navegador,
--    sin pasar por ninguna API con rate limit. Un insider con sesion
--    valida de controlador/organizador podia probar codigos al azar sin
--    freno buscando una colision con una entrada real sin usar. Se agrega
--    el limite DENTRO de la funcion (ya es security definer y conoce
--    auth.uid()), asi protege ambos caminos y cualquier llamador futuro
--    en un solo lugar.
begin;

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
  v_existing_event_product_id uuid;
  v_existing_quantity integer;
begin
  if p_idempotency_key is not null then
    select bs.ticket_id, bs.event_product_id, bs.quantity
    into v_existing_ticket_id, v_existing_event_product_id, v_existing_quantity
    from public.bar_sales bs where bs.idempotency_key = p_idempotency_key;
    if found then
      -- Usa lo que REALMENTE se descarto/canjeo la primera vez (guardado en
      -- la propia fila de bar_sales), no p_event_product_id/p_quantity de
      -- este reintento -- antes, un reintento con datos distintos armaba un
      -- recibo con un producto/cantidad que no eran los entregados de verdad.
      select p.name, t.combo_remaining_quantity, t.combo_remaining_credit_minor,
        b.first_name || ' ' || b.last_name
      into v_product_name, v_remaining_quantity, v_remaining_credit_minor, v_buyer_name
      from public.tickets t
      join public.sales s on s.id = t.sale_id
      join public.buyers b on b.id = s.buyer_id
      join public.event_products ep on ep.id = v_existing_event_product_id
      join public.products p on p.id = ep.product_id
      where t.id = v_existing_ticket_id;

      return query select v_existing_ticket_id, v_product_name, v_existing_quantity, v_remaining_quantity, v_remaining_credit_minor, v_buyer_name;
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

  select t.id, t.status, t.combo_type, t.combo_event_product_id,
    t.combo_remaining_quantity, t.combo_remaining_credit_minor,
    b.first_name || ' ' || b.last_name
  into v_ticket_row_id, v_ticket_status, v_combo_type, v_combo_event_product_id,
    v_remaining_quantity, v_remaining_credit_minor, v_buyer_name
  from public.tickets t
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

  -- Suma EN VIVO de bar_stock (lo que realmente queda repartido en barras
  -- ahora mismo), no el historico acumulado de stock_movements -- ese
  -- historico solo crece y nunca baja aunque despues se consuma o se
  -- pierda stock, y es una metrica distinta a la que ya usa
  -- cp_upsert_event_product para decidir si se puede bajar el total_stock.
  -- Con metricas distintas, bajar el total confiando en una podia dejar
  -- bloqueada para siempre cualquier asignacion futura segun la otra.
  select coalesce(sum(quantity), 0) into v_already_assigned
  from public.bar_stock
  where event_product_id = p_event_product_id;

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

create or replace function public.validate_ticket_manual(
  p_event_id uuid, p_manual_code text, p_method text default 'manual'
)
 RETURNS TABLE(result text, ticket_id uuid, buyer_name text, buyer_dni text, ticket_type text, validated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare

  v_event_status public.event_status;

  v_actor_member_id uuid;

  v_ticket_id uuid;
  v_ticket_status public.ticket_status;
  v_used_at timestamptz;

  v_buyer_name text;
  v_buyer_dni text;
  v_ticket_type text;

  v_code text;
  v_method text;

begin
  if p_method not in ('manual', 'qr', 'manual_offline', 'qr_offline') then
    raise exception 'Metodo de validacion invalido';
  end if;
  v_method := p_method;

  if not public.is_platform_admin() and not exists (
    select 1 from public.events e where e.id = p_event_id
      and public.cp_org_has_service(e.organization_id)
  ) then
    raise exception 'La organizacion necesita una suscripcion activa.';
  end if;


  -- =======================================================
  -- 1. Debe haber usuario autenticado
  -- =======================================================

  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para validar entradas';
  end if;


  -- =======================================================
  -- 2. Normalizamos el código
  -- =======================================================

  v_code := upper(btrim(p_manual_code));

  if v_code = '' then
    raise exception 'Debes ingresar un código de validación';
  end if;


  -- =======================================================
  -- 3. Comprobamos que el evento exista
  -- =======================================================

  select e.status
  into v_event_status
  from public.events e
  where e.id = p_event_id;


  if not found then
    raise exception 'El evento no existe';
  end if;


  -- Para el ingreso real el evento debe estar ACTIVO
  if v_event_status <> 'active' then
    raise exception 'El evento no está habilitado para control de ingreso';
  end if;


  -- =======================================================
  -- 4. Identificamos al usuario dentro de la organización
  -- =======================================================

  select om.id
  into v_actor_member_id
  from public.organization_members om
  join public.events e
    on e.organization_id = om.organization_id
  where e.id = p_event_id
    and om.user_id = auth.uid()
    and om.status = 'active'
  limit 1;


  -- =======================================================
  -- 5. Permisos
  --
  -- Puede validar:
  -- ADMIN CAPITAL PASS
  -- ORGANIZADOR del evento
  -- CONTROLADOR asignado al evento
  -- =======================================================

  if not (
    public.is_platform_admin()

    or public.is_event_organizer(p_event_id)

    or exists (
      select 1
      from public.event_staff es
      join public.organization_members om
        on om.id = es.organization_member_id
      where es.event_id = p_event_id
        and es.staff_role = 'controller'
        and es.active = true
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  ) then

    raise exception
      'No tienes permiso para controlar ingresos en este evento';

  end if;


  -- =======================================================
  -- 5.b Limite de intentos
  --
  -- El codigo manual se llama directo por RPC desde el navegador, sin
  -- pasar por ninguna API con rate limit (el camino QR si lo tiene, en
  -- validar-qr/route.ts). Sin esto, un insider con sesion valida de
  -- controlador/organizador podia probar codigos al azar sin freno
  -- buscando una colision con una entrada real sin usar.
  -- =======================================================

  if not public.cp_check_rate_limit('ticket-validate:' || auth.uid()::text, 120, 60) then
    raise exception 'Demasiados intentos. Esperá un momento.';
  end if;


  -- =======================================================
  -- 6. Buscamos la entrada y BLOQUEAMOS esa fila
  --
  -- Esto impide que dos celulares validen
  -- la misma entrada simultáneamente.
  --
  -- ticket_types es LEFT JOIN: una entrada de mesa (ticket_type_id null)
  -- no tiene que perderse como "código inexistente" solo por no pertenecer
  -- a ninguna tanda -- se identifica por la mesa de su venta en su lugar.
  -- =======================================================

  select
    t.id,
    t.status,
    t.used_at,

    b.first_name || ' ' || b.last_name,
    b.dni,
    coalesce(tt.name, bt.name || ' (mesa)', 'Mesa')

  into
    v_ticket_id,
    v_ticket_status,
    v_used_at,

    v_buyer_name,
    v_buyer_dni,
    v_ticket_type

  from public.tickets t

  join public.sales s
    on s.id = t.sale_id

  join public.buyers b
    on b.id = s.buyer_id

  left join public.ticket_types tt
    on tt.id = t.ticket_type_id

  left join public.bar_tables bt
    on bt.id = s.table_id

  where t.event_id = p_event_id
    and upper(t.manual_code) = v_code

  for update of t;


  -- =======================================================
  -- 7. Código inexistente
  -- =======================================================

  if not found then

    insert into public.entry_scans (
      event_id,
      ticket_id,
      controller_member_id,
      method,
      result
    )
    values (
      p_event_id,
      null,
      v_actor_member_id,
      v_method,
      'invalid'
    );


    return query
    select
      'invalid'::text,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::timestamptz;

    return;

  end if;


  -- =======================================================
  -- 8. Entrada anulada
  -- =======================================================

  if v_ticket_status = 'cancelled' then

    insert into public.entry_scans (
      event_id,
      ticket_id,
      controller_member_id,
      method,
      result
    )
    values (
      p_event_id,
      v_ticket_id,
      v_actor_member_id,
      v_method,
      'cancelled'
    );


    return query
    select
      'cancelled'::text,
      v_ticket_id,
      v_buyer_name,
      v_buyer_dni,
      v_ticket_type,
      null::timestamptz;

    return;

  end if;


  -- =======================================================
  -- 9. Entrada ya utilizada
  -- =======================================================

  if v_ticket_status = 'used' then

    insert into public.entry_scans (
      event_id,
      ticket_id,
      controller_member_id,
      method,
      result
    )
    values (
      p_event_id,
      v_ticket_id,
      v_actor_member_id,
      v_method,
      'already_used'
    );


    return query
    select
      'already_used'::text,
      v_ticket_id,
      v_buyer_name,
      v_buyer_dni,
      v_ticket_type,
      v_used_at;

    return;

  end if;


  -- =======================================================
  -- 10. Entrada válida
  -- La marcamos como USED
  -- =======================================================

  update public.tickets
  set
    status = 'used',
    used_at = now(),
    updated_at = now()
  where id = v_ticket_id
  returning used_at
  into v_used_at;


  -- =======================================================
  -- 11. Registramos el ingreso
  -- =======================================================

  insert into public.entry_scans (
    event_id,
    ticket_id,
    controller_member_id,
    method,
    result
  )
  values (
    p_event_id,
    v_ticket_id,
    v_actor_member_id,
    v_method,
    'valid'
  );


  -- =======================================================
  -- 12. Resultado
  -- =======================================================

  return query
  select
    'valid'::text,
    v_ticket_id,
    v_buyer_name,
    v_buyer_dni,
    v_ticket_type,
    v_used_at;

end;
$function$;

commit;

notify pgrst, 'reload schema';
