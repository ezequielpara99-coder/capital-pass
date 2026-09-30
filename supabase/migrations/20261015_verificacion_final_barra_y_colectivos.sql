-- Bugs reales de la ronda de verificacion final (barra/stock y colectivos):
--
-- 1. redeem_combo_ticket (canje de combo en la barra) y la busqueda previa
--    (/api/stock/combo/lookup, que resuelve un codigo a una entrada real
--    con nombre del comprador y saldo) no tenian ningun limite de
--    intentos -- el mismo patron que ya se le agrego a validate_ticket_manual
--    en esta misma migracion base (20261010), pero nunca se extendio a
--    este camino paralelo. Un bartender (o alguien con su sesion) podia
--    probar codigos al azar sin freno buscando una entrada con
--    consumicion/credito sin usar.
--
-- 2. cancel_transfer_ticket (colectivos) bloqueaba primero el PASAJE y
--    despues la RUTA -- al reves que assign_transfer_ticket y
--    validate_transfer_ticket, que siempre bloquean la ruta primero. Si
--    alguien cancelaba un pasaje justo cuando otra transaccion lo estaba
--    escaneando/asignando al mismo tiempo, Postgres podia terminar en un
--    deadlock real (cada transaccion esperando el lock que tiene la otra).
--    Se reordena para que bloquee en el mismo orden que las demas.
--
-- 3. El atajo de idempotencia por sale_id de assign_transfer_ticket no
--    excluia pasajes cancelados -- si alguien cancelaba un pasaje y
--    despues se volvia a llamar a assign_transfer_ticket con el mismo
--    sale_id+route_id (ej. un futuro boton de "reintentar asignar", o un
--    reintento de red), devolvia el codigo VIEJO ya invalido en vez de uno
--    nuevo, y el indice unico existente ni siquiera dejaba crear uno
--    nuevo para ese mismo par sale_id+route_id.
--
-- 4. El cierre de noche (app/panel/stock/stock-panel-client.tsx, closeBar)
--    manda un ajuste por producto en una tanda de requests secuenciales.
--    Si el primero sale bien y el segundo falla (corte de wifi, el motivo
--    de siempre en estos eventos), el catch no limpia los valores ya
--    guardados -- un reintento normal (el organizador aprieta "Guardar
--    cierre" de nuevo) vuelve a calcular el ajuste del producto que YA se
--    habia guardado con exito, usando el mismo stock desactualizado, y lo
--    aplica una segunda vez. adjust_bar_stock no tenia ninguna proteccion
--    de idempotencia (a diferencia de create_bartender_sale/redeem_combo_ticket,
--    que si la tienen). Se le agrega el mismo mecanismo.
begin;

alter table public.stock_movements add column if not exists idempotency_key text;
create unique index if not exists stock_movements_idempotency_key_uq
  on public.stock_movements (idempotency_key) where idempotency_key is not null;

create or replace function public.adjust_bar_stock(
  p_bar_id uuid, p_event_product_id uuid, p_quantity_delta integer, p_type text, p_reason text,
  p_idempotency_key text default null
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

  -- Reintento de un ajuste que ya se aplico con exito (mismo caller, misma
  -- clave): no hace nada, en vez de aplicar el delta una segunda vez.
  if p_idempotency_key is not null and exists (
    select 1 from public.stock_movements where idempotency_key = p_idempotency_key
  ) then
    return;
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

  insert into public.stock_movements (event_id, event_product_id, bar_id, type, quantity, reason, actor_user_id, idempotency_key)
  values (v_event_id, p_event_product_id, p_bar_id, v_movement_type, abs(p_quantity_delta), p_reason, auth.uid(), p_idempotency_key);
end;
$$;
revoke all on function public.adjust_bar_stock(uuid, uuid, integer, text, text, text) from public, anon;
grant execute on function public.adjust_bar_stock(uuid, uuid, integer, text, text, text) to authenticated;

-- La firma vieja (sin idempotency key) queda huerfana -- se elimina para
-- que PostgREST no quede con dos funciones ambiguas del mismo nombre.
drop function if exists public.adjust_bar_stock(uuid, uuid, integer, text, text);

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

  -- El codigo de la entrada no tiene rate limit propio en ningun otro
  -- lado (a diferencia del QR de control, que ya lo tiene desde 20261010)
  -- -- sin esto, un bartender (o alguien con su sesion) podia probar
  -- codigos al azar sin freno buscando una entrada con consumicion sin usar.
  if not public.cp_check_rate_limit('combo-redeem:' || auth.uid()::text, 60, 60) then
    raise exception 'Demasiados intentos. Esperá un momento.';
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

create or replace function public.assign_transfer_ticket(
  p_route_id uuid,
  p_passenger_name text,
  p_passenger_phone text default null,
  p_sale_id uuid default null,
  p_stop_id uuid default null
)
returns table(transfer_ticket_id uuid, manual_code text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_route record;
  v_actor_member_id uuid;
  v_count integer;
  v_code text;
  v_id uuid;
  v_existing record;
  v_attempt integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  select * into v_route from public.transfer_routes where id = p_route_id and deleted_at is null for update;
  if not found then raise exception 'El colectivo no existe.'; end if;
  if not v_route.active then raise exception 'Este colectivo esta desactivado.'; end if;

  select om.id into v_actor_member_id
  from public.organization_members om
  join public.events e on e.organization_id = om.organization_id
  where e.id = v_route.event_id and om.user_id = auth.uid() and om.status = 'active'
  limit 1;

  if not (
    public.is_platform_admin()
    or public.is_event_organizer(v_route.event_id)
    or (v_actor_member_id is not null and v_route.organization_member_id = v_actor_member_id)
    or (v_actor_member_id is not null and v_route.organization_member_id is null)
  ) then
    raise exception 'No tenes permiso sobre este colectivo.';
  end if;

  if p_stop_id is not null and not exists (
    select 1 from public.transfer_route_stops s where s.id = p_stop_id and s.route_id = p_route_id
  ) then
    raise exception 'La parada no pertenece a este colectivo.';
  end if;

  -- "and status <> 'cancelled'": si el pasaje de esta venta en esta ruta ya
  -- fue cancelado, no hay que devolver ese codigo viejo (ya invalido) como
  -- si fuera el vigente -- se sigue de largo y se genera uno nuevo. El
  -- indice unico de mas abajo tambien se actualiza para permitirlo.
  -- Columnas calificadas con "tt.": "manual_code" es ambiguo sin esto (choca
  -- con el mismo nombre en RETURNS TABLE) -- esta rama nunca se habia
  -- ejercitado en ningun test hasta ahora (todos los tests existentes
  -- llamaban a esta funcion sin p_sale_id), asi que el error quedaba sin
  -- detectar.
  if p_sale_id is not null then
    select tt.id, tt.manual_code into v_existing from public.transfer_tickets tt
    where tt.sale_id = p_sale_id and tt.route_id = p_route_id and tt.status <> 'cancelled';
    if found then
      return query select v_existing.id, v_existing.manual_code;
      return;
    end if;
  end if;

  if v_route.capacity is not null then
    select count(*) into v_count from public.transfer_tickets
    where route_id = p_route_id and status <> 'cancelled';
    if v_count >= v_route.capacity then
      raise exception 'El colectivo ya esta completo.';
    end if;
  end if;

  if trim(coalesce(p_passenger_name, '')) = '' then
    raise exception 'Falta el nombre del pasajero.';
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into public.transfer_tickets(route_id, sale_id, passenger_name, passenger_phone, manual_code, created_by, stop_id)
      values (p_route_id, p_sale_id, trim(p_passenger_name), nullif(trim(coalesce(p_passenger_phone, '')), ''), v_code, auth.uid(), p_stop_id)
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  return query select v_id, v_code;
end;
$function$;

grant execute on function public.assign_transfer_ticket(uuid, text, text, uuid, uuid) to authenticated;

-- El indice viejo bloqueaba (sale_id, route_id) para siempre, incluso
-- despues de cancelar ese pasaje -- se reemplaza por uno que excluye los
-- cancelados, para que assign_transfer_ticket pueda generar un pasaje
-- nuevo para la misma venta/ruta si el anterior se cancelo.
drop index if exists public.transfer_tickets_sale_route_uq;
create unique index if not exists transfer_tickets_sale_route_uq
  on public.transfer_tickets (sale_id, route_id)
  where sale_id is not null and status <> 'cancelled';

create or replace function public.cancel_transfer_ticket(
  p_ticket_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_route record;
  v_ticket record;
  v_actor_member_id uuid;
  v_route_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  -- Mismo orden de locks que assign_transfer_ticket/validate_transfer_ticket
  -- (primero la ruta, despues el pasaje) -- antes bloqueaba al reves, lo
  -- que podia generar un deadlock real si alguien cancelaba un pasaje
  -- justo cuando otra transaccion lo estaba escaneando/asignando al mismo
  -- tiempo (cada una esperando el lock que ya tiene la otra).
  select route_id into v_route_id from public.transfer_tickets where id = p_ticket_id;
  if v_route_id is null then
    raise exception 'El pasaje no existe.';
  end if;

  select * into v_route from public.transfer_routes where id = v_route_id and deleted_at is null for update;
  if not found then
    raise exception 'El colectivo no existe.';
  end if;

  select t.* into v_ticket from public.transfer_tickets t where t.id = p_ticket_id for update;
  if not found then
    raise exception 'El pasaje no existe.';
  end if;
  if v_ticket.status = 'cancelled' then
    raise exception 'Este pasaje ya esta cancelado.';
  end if;
  if v_ticket.status = 'used' then
    raise exception 'No se puede cancelar un pasaje que ya embarco.';
  end if;

  select om.id into v_actor_member_id
  from public.organization_members om
  join public.events e on e.organization_id = om.organization_id
  where e.id = v_route.event_id and om.user_id = auth.uid() and om.status = 'active'
  limit 1;

  if not (
    public.is_platform_admin()
    or public.is_event_organizer(v_route.event_id)
    or (v_actor_member_id is not null and v_route.organization_member_id = v_actor_member_id)
    or (v_actor_member_id is not null and v_route.organization_member_id is null)
  ) then
    raise exception 'No tenes permiso sobre este colectivo.';
  end if;

  update public.transfer_tickets
  set status = 'cancelled', used_at = now(), used_by = v_actor_member_id
  where id = p_ticket_id;
end;
$function$;

commit;

notify pgrst, 'reload schema';
