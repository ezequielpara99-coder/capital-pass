-- Las funciones wallet_move, check_blacklist, assign_transfer_ticket y
-- validate_transfer_ticket ya estaban en produccion ANTES del soft-delete
-- (20260979) y no chequean deleted_at -- sin este fix, un socio/colectivo/
-- entrada de lista negra "borrado" seguia funcionando de lleno en estas 4
-- funciones (mover saldo, reconocer en la puerta, sumar pasajeros).
begin;

create or replace function public.wallet_move(
  p_member_id uuid,
  p_amount_minor bigint,
  p_kind text,
  p_note text default null
)
returns table(new_balance_minor bigint)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org_id uuid;
  v_balance bigint;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  if p_kind not in ('topup', 'spend', 'adjustment') then
    raise exception 'Tipo de movimiento invalido.';
  end if;

  if p_amount_minor = 0 then
    raise exception 'El monto no puede ser cero.';
  end if;

  select organization_id, balance_minor into v_org_id, v_balance
  from public.premium_members
  where id = p_member_id and deleted_at is null
  for update;

  if v_org_id is null then
    raise exception 'El socio no existe.';
  end if;

  if not (public.is_platform_admin() or exists (
    select 1 from public.organization_members om
    where om.organization_id = v_org_id and om.user_id = auth.uid()
      and om.role = 'organizer' and om.status = 'active'
  )) then
    raise exception 'No tenes permiso sobre este socio.';
  end if;

  if v_balance + p_amount_minor < 0 then
    raise exception 'Saldo insuficiente.';
  end if;

  update public.premium_members set balance_minor = balance_minor + p_amount_minor, updated_at = now()
  where id = p_member_id and deleted_at is null;

  insert into public.wallet_transactions(member_id, amount_minor, kind, note, created_by)
  values (p_member_id, p_amount_minor, p_kind, nullif(trim(coalesce(p_note, '')), ''), auth.uid());

  return query select v_balance + p_amount_minor;
end;
$function$;

create or replace function public.check_blacklist(p_event_id uuid, p_dni text)
returns table(is_blacklisted boolean, reason text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org_id uuid;
  v_dni text;
  v_entry record;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  select organization_id into v_org_id from public.events where id = p_event_id;
  if v_org_id is null then raise exception 'El evento no existe.'; end if;

  if not (
    public.is_platform_admin()
    or public.is_event_organizer(p_event_id)
    or exists (
      select 1 from public.event_staff es
      join public.organization_members om on om.id = es.organization_member_id
      where es.event_id = p_event_id and es.staff_role = 'controller'
        and es.active = true and om.user_id = auth.uid() and om.status = 'active'
    )
  ) then
    raise exception 'No tenes permiso para consultar la lista negra de este evento.';
  end if;

  v_dni := regexp_replace(coalesce(p_dni, ''), '\D', '', 'g');
  if v_dni = '' then
    return query select false, null::text;
    return;
  end if;

  select * into v_entry from public.blacklist_entries
  where organization_id = v_org_id
    and active = true
    and deleted_at is null
    and regexp_replace(coalesce(dni, ''), '\D', '', 'g') = v_dni
  limit 1;

  if not found then
    return query select false, null::text;
    return;
  end if;

  return query select true, v_entry.reason;
end;
$function$;

create or replace function public.assign_transfer_ticket(
  p_route_id uuid,
  p_passenger_name text,
  p_passenger_phone text default null,
  p_sale_id uuid default null
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

  select * into v_route from public.transfer_routes where id = p_route_id and deleted_at is null;
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
  ) then
    raise exception 'No tenes permiso sobre este colectivo.';
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

  insert into public.transfer_tickets(route_id, sale_id, passenger_name, passenger_phone, manual_code, created_by)
  values (p_route_id, p_sale_id, trim(p_passenger_name), nullif(trim(coalesce(p_passenger_phone, '')), ''), v_code, auth.uid())
  returning id into v_id;

  return query select v_id, v_code;
end;
$function$;

create or replace function public.validate_transfer_ticket(
  p_route_id uuid,
  p_manual_code text
)
returns table(result text, transfer_ticket_id uuid, passenger_name text, validated_at timestamptz)
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
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  select * into v_route from public.transfer_routes where id = p_route_id and deleted_at is null;
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
  ) then
    raise exception 'No tenes permiso sobre este colectivo.';
  end if;

  v_code := upper(btrim(p_manual_code));
  if v_code = '' then
    raise exception 'Ingresa el codigo del pasajero.';
  end if;

  select t.id, t.status, t.used_at, t.passenger_name
  into v_ticket_id, v_status, v_used_at, v_passenger
  from public.transfer_tickets t
  where t.route_id = p_route_id and upper(t.manual_code) = v_code
  for update of t;

  if not found then
    return query select 'invalid'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if v_status = 'cancelled' then
    return query select 'cancelled'::text, v_ticket_id, v_passenger, v_used_at;
    return;
  end if;

  if v_status = 'used' then
    return query select 'already_used'::text, v_ticket_id, v_passenger, v_used_at;
    return;
  end if;

  update public.transfer_tickets
  set status = 'used', used_at = now(), used_by = v_actor_member_id
  where id = v_ticket_id;

  return query select 'valid'::text, v_ticket_id, v_passenger, now();
end;
$function$;

commit;

notify pgrst, 'reload schema';
