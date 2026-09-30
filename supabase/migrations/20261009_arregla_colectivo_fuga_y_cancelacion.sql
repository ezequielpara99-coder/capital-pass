-- Cuatro bugs reales de la ronda de auditoria del sistema de colectivos:
--
-- 1. (CRITICO) trackingForIdentity (lib/traslados/tracking.ts) buscaba
--    pasajes de colectivo por telefono SIN filtrar por organizacion -- un
--    telefono coincidente con el de un pasajero de OTRA organizacion (dato
--    cargado en cualquier lado, ej. el telefono de un socio premium en una
--    organizacion sin relacion) exponia el codigo de embarque y el
--    recorrido de un colectivo ajeno. Se arregla del lado de la app
--    (filtro por organizacion), no requiere cambios en la base.
--
-- 2. validate_transfer_ticket no tenia ningun limite de intentos -- se
--    llama directo por RPC desde el navegador (sin pasar por una API con
--    rate limit, a diferencia del escaneo de QR de entradas normales), y
--    el codigo de 6 caracteres alcanzanzables no tiene firma. Un miembro
--    con acceso a un colectivo general podia probar codigos al azar sin
--    limite, marcando pasajes ajenos como "used" y bloqueando a los
--    pasajeros reales (denegacion de servicio).
--
-- 3. assign_transfer_ticket generaba el codigo de 6 caracteres sin ningun
--    reintento ante una colision -- el indice unico (route_id, manual_code)
--    ya protegia contra el duplicado, pero el insert fallaba con un error
--    crudo de Postgres en vez de generar otro codigo.
--
-- 4. No existia ninguna forma de cancelar un pasaje ya asignado: si un
--    pasajero avisaba que no iba, su lugar quedaba ocupado para siempre
--    (el cupo cuenta "where status <> 'cancelled'") y su codigo seguia
--    siendo valido indefinidamente.
begin;

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

  -- "for update": sin esto, dos asignaciones en paralelo podian leer el
  -- mismo conteo de cupo y las dos pasar el chequeo (venta de mas).
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
    -- Colectivo "general" (sin RRPP dueño): cualquier miembro activo de la
    -- organizacion del evento lo puede usar.
    or (v_actor_member_id is not null and v_route.organization_member_id is null)
  ) then
    raise exception 'No tenes permiso sobre este colectivo.';
  end if;

  if p_stop_id is not null and not exists (
    select 1 from public.transfer_route_stops s where s.id = p_stop_id and s.route_id = p_route_id
  ) then
    raise exception 'La parada no pertenece a este colectivo.';
  end if;

  if p_sale_id is not null then
    select id, manual_code into v_existing from public.transfer_tickets
    where sale_id = p_sale_id and route_id = p_route_id;
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

  -- Reintenta con otro codigo si por azar ya existe uno igual en este
  -- colectivo (indice unico route_id+manual_code) -- antes el insert
  -- fallaba con un error crudo de Postgres en vez de generar otro codigo.
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

create or replace function public.validate_transfer_ticket(
  p_route_id uuid,
  p_manual_code text
)
returns table(result text, transfer_ticket_id uuid, passenger_name text, validated_at timestamptz, stop_name text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_route record;
  v_actor_member_id uuid;
  v_code text;
  v_ticket_id uuid;
  v_status text;
  v_used_at timestamptz;
  v_passenger text;
  v_stop_id uuid;
  v_stop_name text;
  v_stop_pos integer;
  v_cur_pos integer;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  -- "for update": el tracking de "por donde va" (mas abajo) depende de leer
  -- current_stop_id y despues escribirlo sin que otra validacion se cuele
  -- en el medio -- si no, dos paradas escaneadas casi juntas podian quedar
  -- guardadas en el orden equivocado.
  select * into v_route from public.transfer_routes where id = p_route_id and deleted_at is null for update;
  if not found then raise exception 'El colectivo no existe.'; end if;

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

  -- El codigo de 6 caracteres no tiene firma (a diferencia del QR de
  -- entradas normales) -- sin este limite, cualquiera con acceso a un
  -- colectivo general podia probar codigos al azar sin freno, marcando
  -- pasajes ajenos como "used" y bloqueando al pasajero real.
  if not public.cp_check_rate_limit('transfer-validate:' || auth.uid()::text, 120, 60) then
    raise exception 'Demasiados intentos. Esperá un momento.';
  end if;

  v_code := upper(btrim(p_manual_code));
  if v_code = '' then
    raise exception 'Ingresa el codigo del pasajero.';
  end if;

  select t.id, t.status, t.used_at, t.passenger_name, t.stop_id
  into v_ticket_id, v_status, v_used_at, v_passenger, v_stop_id
  from public.transfer_tickets t
  where t.route_id = p_route_id and upper(t.manual_code) = v_code
  for update of t;

  if not found then
    return query select 'invalid'::text, null::uuid, null::text, null::timestamptz, null::text;
    return;
  end if;

  select s.name, s.position into v_stop_name, v_stop_pos from public.transfer_route_stops s where s.id = v_stop_id;

  if v_status = 'cancelled' then
    return query select 'cancelled'::text, v_ticket_id, v_passenger, v_used_at, v_stop_name;
    return;
  end if;

  if v_status = 'used' then
    return query select 'already_used'::text, v_ticket_id, v_passenger, v_used_at, v_stop_name;
    return;
  end if;

  update public.transfer_tickets
  set status = 'used', used_at = now(), used_by = v_actor_member_id
  where id = v_ticket_id;

  -- El colectivo esta en la parada de este pasajero: avanza la posicion
  -- (nunca retrocede) y registra la llegada la primera vez.
  if v_stop_id is not null then
    if v_route.current_stop_id is not null then
      select s.position into v_cur_pos from public.transfer_route_stops s where s.id = v_route.current_stop_id;
    end if;

    if v_route.current_stop_id is null or (v_cur_pos is not null and v_stop_pos > v_cur_pos) then
      update public.transfer_routes set current_stop_id = v_stop_id, current_stop_at = now() where id = p_route_id;
    end if;

    insert into public.transfer_route_arrivals (route_id, stop_id, source)
    values (p_route_id, v_stop_id, 'scan')
    on conflict (route_id, stop_id) do nothing;
  end if;

  return query select 'valid'::text, v_ticket_id, v_passenger, now(), v_stop_name;
end;
$function$;

grant execute on function public.validate_transfer_ticket(uuid, text) to authenticated;

-- Cancela un pasaje todavia sin usar -- libera el cupo (el conteo de
-- assign_transfer_ticket ya excluye 'cancelled') e invalida su codigo para
-- siempre (validate_transfer_ticket ya sabe responder "cancelled" para ese
-- caso, esa rama nunca se podia ejercitar porque nada producia el estado).
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
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
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

  select * into v_route from public.transfer_routes where id = v_ticket.route_id and deleted_at is null for update;
  if not found then
    raise exception 'El colectivo no existe.';
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

revoke all on function public.cancel_transfer_ticket(uuid, text) from public, anon;
grant execute on function public.cancel_transfer_ticket(uuid, text) to authenticated;

commit;

notify pgrst, 'reload schema';
