-- Bugs reales de la ronda de auditoria extendida de venta/QR (RRPP,
-- organizador, puerta):
--
-- 1. (CRITICO) sell_table (venta de mesa en persona, por RRPP u
--    organizador) nunca generaba una fila en tickets -- a diferencia de
--    confirm_online_sale, que ya arreglo exactamente este mismo problema
--    para las mesas compradas ONLINE (20261002_qr_de_mesa.sql). Una mesa
--    vendida en persona quedaba reservada y cobrada, pero sin QR ni
--    codigo manual: en la puerta no habia forma de validarla (ni
--    validate_ticket_manual ni el escaneo de QR la encontraban), y el
--    comprador se quedaba sin ninguna entrada digital.
--
-- 2. sell_table no tenia el mismo manejo atomico de doble-tap que ya tiene
--    create_sale desde 20260999 -- un doble click casi simultaneo con la
--    misma idempotency key no chocaba contra el indice unico de forma
--    recuperable: el segundo intento quedaba bloqueado en el lock de la
--    mesa y, al desbloquearse, veia la mesa ya reservada y devolvia "Esa
--    mesa ya no esta disponible" en vez de la venta que SI se concreto.
--
-- 3. Ni create_sale ni sell_table tenian ningun limite de intentos -- se
--    llaman directo por RPC desde el navegador (create_sale) o via una
--    API route sin rate limit (sell_table), sin pasar por ningun freno
--    del lado del servidor. Se les agrega el mismo mecanismo que ya usan
--    otras rutas sensibles del sistema.
--
-- 4. tickets.manual_code no tenia ninguna restriccion de unicidad
--    versionada -- su generacion vive fuera de las migraciones (en la
--    base real, no rastreable desde el repo), y las funciones que buscan
--    por codigo (validate_ticket_manual, redeem_combo_ticket) lo hacen
--    con un "select ... into" sin order by: si alguna vez colisionara,
--    Postgres no lo hubiera impedido y la busqueda hubiera tomado una
--    fila cualquiera de las dos en conflicto sin avisar. Verificado antes
--    de esta migracion: en la base real de produccion no hay ningun
--    duplicado hoy (54 entradas, 0 codigos repetidos, 0 nulos), asi que
--    agregar el indice unico ahora es seguro.
begin;

create unique index if not exists tickets_event_manual_code_uq
  on public.tickets (event_id, upper(manual_code))
  where manual_code is not null;

create or replace function public.sell_table(
  p_event_id uuid, p_table_id uuid,
  p_buyer_first_name text, p_buyer_last_name text, p_buyer_dni text, p_buyer_phone text,
  p_payment_method text,
  p_idempotency_key uuid default null
)
returns table(sale_id uuid, total_minor bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_organization_id uuid;
  v_seller_member_id uuid;
  v_seller_role public.organization_member_role;
  v_price bigint;
  v_status text;
  v_buyer_id uuid;
  v_sale_id uuid;
  v_existing_total bigint;
  v_payment_method public.sale_payment_method;
begin
  if p_idempotency_key is not null then
    select s.id, s.total_minor into v_sale_id, v_existing_total
    from public.sales s where s.idempotency_key = p_idempotency_key;
    if found then
      return query select v_sale_id, v_existing_total;
      return;
    end if;
  end if;

  if not public.is_platform_admin() and not exists (
    select 1 from public.events e where e.id = p_event_id and public.cp_org_has_service(e.organization_id)
  ) then
    raise exception 'La organizacion necesita una suscripcion activa.';
  end if;

  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  -- Mismo limite que ya se le agrego a create_sale: ninguna de las dos
  -- formas de vender en persona tenia freno alguno de intentos por minuto.
  if not public.cp_check_rate_limit('sale-create:' || auth.uid()::text, 30, 60) then
    raise exception 'Demasiados intentos. Esperá un momento.';
  end if;

  begin
    v_payment_method := p_payment_method::public.sale_payment_method;
  exception when invalid_text_representation then
    raise exception 'Indica si la venta fue en efectivo o transferencia';
  end;

  if p_buyer_first_name is null or btrim(p_buyer_first_name) = '' then
    raise exception 'El nombre del comprador es obligatorio';
  end if;
  if p_buyer_last_name is null or btrim(p_buyer_last_name) = '' then
    raise exception 'El apellido del comprador es obligatorio';
  end if;
  if p_buyer_phone is null or btrim(p_buyer_phone) = '' then
    raise exception 'El WhatsApp del comprador es obligatorio';
  end if;

  select e.organization_id into v_organization_id from public.events e where e.id = p_event_id;
  if not found then
    raise exception 'El evento no existe';
  end if;

  select om.id, om.role into v_seller_member_id, v_seller_role
  from public.organization_members om
  where om.organization_id = v_organization_id and om.user_id = auth.uid() and om.status = 'active'
  limit 1;

  if v_seller_member_id is null or v_seller_role not in ('organizer', 'rrpp') then
    raise exception 'No tenes permiso para vender mesas en este evento';
  end if;

  if v_seller_role = 'rrpp' and not exists (
    select 1 from public.event_staff es
    where es.event_id = p_event_id and es.organization_member_id = v_seller_member_id
      and es.staff_role = 'rrpp' and es.active = true
  ) then
    raise exception 'No estas asignado como RRPP a este evento';
  end if;

  select price_minor, status into v_price, v_status
  from public.bar_tables where id = p_table_id and event_id = p_event_id
  for update;

  if not found then
    raise exception 'La mesa no existe para este evento';
  end if;

  if v_status <> 'available' then
    raise exception 'Esa mesa ya no esta disponible';
  end if;

  -- Bloque protegido: mismo motivo y misma forma que ya tiene create_sale
  -- (20260999) -- un doble-tap casi simultaneo con la MISMA idempotency
  -- key, antes de este fix, chocaba contra el lock de la mesa (no contra
  -- el indice unico) y el segundo intento veia la mesa ya reservada,
  -- devolviendo "no disponible" en vez de la venta que SI se registro.
  begin
    insert into public.buyers (organization_id, first_name, last_name, dni, phone)
    values (v_organization_id, btrim(p_buyer_first_name), btrim(p_buyer_last_name), nullif(btrim(coalesce(p_buyer_dni, '')), ''), btrim(p_buyer_phone))
    returning id into v_buyer_id;

    insert into public.sales (organization_id, event_id, buyer_id, seller_member_id, status, total_minor, currency, channel, payment_method, table_id, confirmed_at, idempotency_key)
    values (v_organization_id, p_event_id, v_buyer_id, v_seller_member_id, 'confirmed', coalesce(v_price, 0), 'ARS', 'mesa', v_payment_method, p_table_id, now(), p_idempotency_key)
    returning id into v_sale_id;

    update public.bar_tables set status = 'reserved' where id = p_table_id;

    -- La mesa (channel 'mesa', sin sale_items/ticket_type_id) tiene un
    -- unico ticket propio, igual que ya hace confirm_online_sale para las
    -- mesas compradas online -- mismo QR firmado, mismo control de puerta.
    insert into public.tickets (sale_id, event_id, status)
    values (v_sale_id, p_event_id, 'issued');

  exception when unique_violation then
    if p_idempotency_key is null then
      raise;
    end if;
    select s.id, s.total_minor into v_sale_id, v_existing_total
    from public.sales s where s.idempotency_key = p_idempotency_key;
    if not found then
      raise;
    end if;
    return query select v_sale_id, v_existing_total;
    return;
  end;

  return query select v_sale_id, coalesce(v_price, 0);
end;
$$;
revoke all on function public.sell_table(uuid, uuid, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.sell_table(uuid, uuid, text, text, text, text, text, uuid) to authenticated;

create or replace function public.create_sale(
  p_event_id uuid, p_ticket_type_id uuid, p_quantity integer,
  p_buyer_first_name text, p_buyer_last_name text, p_buyer_dni text, p_buyer_phone text,
  p_buyer_email text default null, p_payment_method text default null, p_pack_id uuid default null,
  p_idempotency_key uuid default null
)
 RETURNS TABLE(sale_id uuid, buyer_id uuid, total_minor bigint, tickets_created integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_organization_id uuid;
  v_event_status public.event_status;

  v_rrpp_sales_enabled boolean;
  v_rrpp_sales_cutoff_at timestamptz;

  v_door_sales_enabled boolean;
  v_door_sales_start_at timestamptz;
  v_door_sales_end_at timestamptz;

  v_ticket_price bigint;
  v_ticket_currency text;
  v_ticket_capacity integer;
  v_ticket_active boolean;
  v_ticket_status public.ticket_type_status;
  v_combo_type text;
  v_combo_event_product_id uuid;
  v_combo_quantity integer;
  v_combo_credit_minor bigint;

  v_sales_start timestamptz;
  v_sales_end timestamptz;

  v_sold integer;
  v_pending integer;

  v_seller_member_id uuid;
  v_seller_role public.organization_member_role;
  v_sale_channel public.sale_channel;
  v_payment_method public.sale_payment_method;
  v_commission_percentage numeric;

  v_buyer_id uuid;
  v_sale_id uuid;
  v_sale_item_id uuid;
  v_existing_total bigint;
  v_existing_tickets integer;

  v_pack public.ticket_packs%rowtype;
  v_effective_ticket_type_id uuid;
  v_effective_quantity integer;
  v_unit_price_for_items bigint;

  v_total bigint;
begin
  if p_idempotency_key is not null then
    select s.id, s.buyer_id, s.total_minor into v_sale_id, v_buyer_id, v_existing_total
    from public.sales s where s.idempotency_key = p_idempotency_key;
    if found then
      select count(*)::integer into v_existing_tickets from public.tickets t where t.sale_id = v_sale_id;
      return query select v_sale_id, v_buyer_id, v_existing_total, v_existing_tickets;
      return;
    end if;
  end if;

  if not public.is_platform_admin() and not exists (
    select 1 from public.events e where e.id = p_event_id
      and public.cp_org_has_service(e.organization_id)
  ) then
    raise exception 'La organizacion necesita una suscripcion activa.';
  end if;

  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para registrar una venta';
  end if;

  -- Ni esta funcion ni sell_table tenian ningun limite de intentos -- se
  -- llaman directo por RPC desde el navegador, sin pasar por ninguna API
  -- con rate limit. Mismo mecanismo que ya usan otras rutas sensibles.
  if not public.cp_check_rate_limit('sale-create:' || auth.uid()::text, 30, 60) then
    raise exception 'Demasiados intentos. Esperá un momento.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
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

  if p_pack_id is not null then
    select * into v_pack from public.ticket_packs
    where id = p_pack_id and event_id = p_event_id and active = true;
    if not found then
      raise exception 'El pack no existe o no esta disponible para este evento';
    end if;
    v_effective_ticket_type_id := v_pack.ticket_type_id;
    v_effective_quantity := v_pack.quantity_per_pack * p_quantity;
  else
    v_effective_ticket_type_id := p_ticket_type_id;
    v_effective_quantity := p_quantity;
  end if;

  if v_effective_quantity > 100 then
    raise exception 'No se pueden vender más de 100 entradas en una sola operación';
  end if;

  select
    e.organization_id, e.status,
    e.rrpp_sales_enabled, e.rrpp_sales_cutoff_at,
    e.door_sales_enabled, e.door_sales_start_at, e.door_sales_end_at,
    tt.price_minor, tt.currency, tt.capacity, tt.active, tt.status,
    tt.sales_start_at, tt.sales_end_at,
    tt.combo_type, tt.combo_event_product_id, tt.combo_quantity, tt.combo_credit_minor
  into
    v_organization_id, v_event_status,
    v_rrpp_sales_enabled, v_rrpp_sales_cutoff_at,
    v_door_sales_enabled, v_door_sales_start_at, v_door_sales_end_at,
    v_ticket_price, v_ticket_currency, v_ticket_capacity, v_ticket_active, v_ticket_status,
    v_sales_start, v_sales_end,
    v_combo_type, v_combo_event_product_id, v_combo_quantity, v_combo_credit_minor
  from public.ticket_types tt
  join public.events e on e.id = tt.event_id
  where tt.id = v_effective_ticket_type_id and tt.event_id = p_event_id
  for update of tt;

  if not found then
    raise exception 'La tanda no existe para este evento';
  end if;

  if v_event_status not in ('upcoming', 'active') then
    raise exception 'Este evento no está habilitado para vender entradas';
  end if;

  select om.id, om.role into v_seller_member_id, v_seller_role
  from public.organization_members om
  where om.organization_id = v_organization_id
    and om.user_id = auth.uid() and om.status = 'active'
  limit 1;

  if v_seller_member_id is null then
    raise exception 'No perteneces a la organización de este evento';
  end if;

  if v_seller_role = 'organizer' then
    v_sale_channel := 'organizer';

  elsif v_seller_role = 'rrpp' then
    select es.commission_percentage into v_commission_percentage
    from public.event_staff es
    where es.event_id = p_event_id and es.organization_member_id = v_seller_member_id
      and es.staff_role = 'rrpp' and es.active = true;
    if not found then
      raise exception 'No estás asignado como RRPP a este evento';
    end if;
    if v_rrpp_sales_enabled = false then
      raise exception 'Las ventas de RRPP están bloqueadas';
    end if;
    if v_rrpp_sales_cutoff_at is not null and now() > v_rrpp_sales_cutoff_at then
      raise exception 'Finalizó el horario de venta para RRPP';
    end if;
    v_sale_channel := 'rrpp';

  elsif v_seller_role = 'door_seller' then
    if not exists (
      select 1 from public.event_staff es
      where es.event_id = p_event_id and es.organization_member_id = v_seller_member_id
        and es.staff_role = 'door_seller' and es.active = true
    ) then
      raise exception 'No estás asignado a la venta en puerta de este evento';
    end if;
    if v_event_status <> 'active' then
      raise exception 'La venta en puerta sólo está disponible con el evento activo';
    end if;
    if v_door_sales_enabled = false then
      raise exception 'La venta en puerta está deshabilitada';
    end if;
    if v_door_sales_start_at is not null and now() < v_door_sales_start_at then
      raise exception 'La venta en puerta todavía no comenzó';
    end if;
    if v_door_sales_end_at is not null and now() > v_door_sales_end_at then
      raise exception 'Finalizó el horario de venta en puerta';
    end if;
    v_sale_channel := 'door';

  else
    raise exception 'Tu usuario no tiene permiso para registrar ventas';
  end if;

  if v_sale_channel in ('rrpp', 'door') then
    if p_payment_method is null or btrim(p_payment_method) = '' then
      raise exception 'Indica si la venta fue en efectivo o transferencia';
    end if;
    begin
      v_payment_method := p_payment_method::public.sale_payment_method;
    exception when invalid_text_representation then
      raise exception 'Metodo de pago invalido';
    end;
  else
    v_payment_method := null;
  end if;

  if v_ticket_active = false then
    raise exception 'Esta tanda está deshabilitada';
  end if;
  if v_ticket_status = 'upcoming' then
    raise exception 'Esta tanda todavía no está disponible';
  end if;
  if v_ticket_status = 'paused' then
    raise exception 'La venta de esta tanda está pausada';
  end if;
  if v_ticket_status = 'sold_out' then
    raise exception 'Esta tanda está agotada';
  end if;
  if v_ticket_status <> 'available' then
    raise exception 'Esta tanda no está disponible';
  end if;

  if v_sales_start is not null and now() < v_sales_start then
    raise exception 'La venta de esta tanda todavía no comenzó';
  end if;
  if v_sales_end is not null and now() > v_sales_end then
    raise exception 'La venta de esta tanda ya finalizó';
  end if;

  select count(*)::integer into v_sold
  from public.tickets t
  where t.ticket_type_id = v_effective_ticket_type_id and t.status <> 'cancelled';

  select coalesce(sum(si.quantity), 0)::integer into v_pending
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where si.ticket_type_id = v_effective_ticket_type_id
    and s.status = 'pending_approval'
    and s.channel = 'online'
    and s.created_at > now() - interval '30 minutes';

  if v_sold + v_pending + v_effective_quantity > v_ticket_capacity then
    raise exception 'No hay suficientes entradas disponibles. Disponibles: %', greatest(v_ticket_capacity - v_sold - v_pending, 0);
  end if;

  if p_pack_id is not null then
    v_total := v_pack.price_minor * p_quantity::bigint;
    v_unit_price_for_items := round(v_pack.price_minor::numeric / v_pack.quantity_per_pack);
  else
    v_total := v_ticket_price * p_quantity::bigint;
    v_unit_price_for_items := v_ticket_price;
  end if;

  begin
    insert into public.buyers (organization_id, first_name, last_name, dni, phone, email)
    values (v_organization_id, btrim(p_buyer_first_name), btrim(p_buyer_last_name), btrim(p_buyer_dni), btrim(p_buyer_phone), nullif(btrim(p_buyer_email), ''))
    returning id into v_buyer_id;

    insert into public.sales (organization_id, event_id, buyer_id, seller_member_id, status, total_minor, currency, channel, payment_method, confirmed_at, idempotency_key, commission_percentage_snapshot)
    values (v_organization_id, p_event_id, v_buyer_id, v_seller_member_id, 'confirmed', v_total, v_ticket_currency, v_sale_channel, v_payment_method, now(), p_idempotency_key, case when v_sale_channel = 'rrpp' then v_commission_percentage else null end)
    returning id into v_sale_id;

    insert into public.sale_items (sale_id, event_id, ticket_type_id, quantity, unit_price_minor, pack_id, combo_type, combo_event_product_id, combo_quantity, combo_credit_minor)
    values (v_sale_id, p_event_id, v_effective_ticket_type_id, v_effective_quantity, v_unit_price_for_items, p_pack_id, v_combo_type, v_combo_event_product_id, v_combo_quantity, v_combo_credit_minor)
    returning id into v_sale_item_id;

    insert into public.tickets (sale_item_id, sale_id, event_id, ticket_type_id, status, combo_type, combo_event_product_id, combo_remaining_quantity, combo_remaining_credit_minor)
    select v_sale_item_id, v_sale_id, p_event_id, v_effective_ticket_type_id, 'issued', v_combo_type, v_combo_event_product_id, v_combo_quantity, v_combo_credit_minor
    from generate_series(1, v_effective_quantity);

    if v_sold + v_effective_quantity >= v_ticket_capacity then
      update public.ticket_types set status = 'sold_out', updated_at = now() where id = v_effective_ticket_type_id;
    end if;

    insert into public.audit_logs (actor_user_id, organization_id, event_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), v_organization_id, p_event_id, 'SALE_CREATED', 'sale', v_sale_id,
      jsonb_build_object('quantity', v_effective_quantity, 'ticket_type_id', v_effective_ticket_type_id, 'total_minor', v_total, 'channel', v_sale_channel, 'payment_method', v_payment_method, 'pack_id', p_pack_id));

  exception when unique_violation then
    if p_idempotency_key is null then
      raise;
    end if;
    select s.id, s.buyer_id, s.total_minor into v_sale_id, v_buyer_id, v_existing_total
    from public.sales s where s.idempotency_key = p_idempotency_key;
    if not found then
      raise;
    end if;
    select count(*)::integer into v_existing_tickets from public.tickets t where t.sale_id = v_sale_id;
    return query select v_sale_id, v_buyer_id, v_existing_total, v_existing_tickets;
    return;
  end;

  return query select v_sale_id, v_buyer_id, v_total, v_effective_quantity;
end;
$function$;

commit;

notify pgrst, 'reload schema';
