-- Dos bugs reales encontrados en una ronda de auditoria sobre traslados
-- (20260971/20260986):
--
-- 1. Un colectivo "general" (organization_member_id is null, el que puede
--    armar el organizador para que lo use cualquier RRPP) en la practica
--    NUNCA lo podia usar ningun RRPP: el chequeo de permiso comparaba
--    v_route.organization_member_id = v_actor_member_id, que da NULL (no
--    true) cuando el colectivo es general. Solo el organizador podia
--    asignar pasajeros, validarlos al subir o marcar la parada. El RRPP
--    vendia el traslado, lo cobraba, y el pasaje nunca se generaba (el
--    error se tragaba en el front). Ahora cualquier miembro activo de la
--    organizacion del evento puede operar un colectivo general.
--
-- 2. Ni assign_transfer_ticket ni validate_transfer_ticket bloqueaban la
--    fila del colectivo (sin "for update"): dos asignaciones en paralelo
--    podian pasar juntas el chequeo de cupo y vender de mas, y dos
--    validaciones en paralelo (paradas distintas) podian escribir
--    current_stop_id fuera de orden a pesar del comentario "nunca
--    retrocede". transfer_mark_stop ya bloqueaba la fila (no se toca).
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

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.transfer_tickets(route_id, sale_id, passenger_name, passenger_phone, manual_code, created_by, stop_id)
  values (p_route_id, p_sale_id, trim(p_passenger_name), nullif(trim(coalesce(p_passenger_phone, '')), ''), v_code, auth.uid(), p_stop_id)
  returning id into v_id;

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

create or replace function public.transfer_mark_stop(p_route_id uuid, p_stop_id uuid)
returns table(current_stop_id uuid, current_stop_at timestamptz)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_route record;
  v_actor_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

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

  if p_stop_id is null then
    delete from public.transfer_route_arrivals where route_id = p_route_id;
    -- Reiniciar el recorrido borra los avisos ya mandados (20260987): un
    -- recorrido nuevo tiene que volver a avisar. Se habia perdido esta
    -- linea al recrear la funcion en esta migracion -- restaurada.
    delete from public.transfer_notifications
    where ticket_id in (select t.id from public.transfer_tickets t where t.route_id = p_route_id);
    update public.transfer_routes set current_stop_id = null, current_stop_at = null where id = p_route_id;
    return query select null::uuid, null::timestamptz;
    return;
  end if;

  if not exists (select 1 from public.transfer_route_stops s where s.id = p_stop_id and s.route_id = p_route_id) then
    raise exception 'La parada no pertenece a este colectivo.';
  end if;

  update public.transfer_routes set current_stop_id = p_stop_id, current_stop_at = now() where id = p_route_id;

  insert into public.transfer_route_arrivals (route_id, stop_id, source)
  values (p_route_id, p_stop_id, 'manual')
  on conflict (route_id, stop_id) do update set arrived_at = now(), source = 'manual';

  return query select p_stop_id, now();
end;
$function$;

grant execute on function public.transfer_mark_stop(uuid, uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
