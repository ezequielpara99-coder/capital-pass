-- Paso 0 del modo offline de control de ingreso: validate_ticket_manual
-- hardcodeaba method = 'manual' en las 4 filas que inserta en
-- entry_scans -- ni siquiera distinguia si el escaneo vino de QR o de
-- codigo tipeado (el camino QR de app/api/control/validar-qr/route.ts
-- termina llamando a esta misma funcion). Se agrega p_method (con
-- default 'manual' para no romper como se llama hoy) para poder
-- registrar en el reporte si un escaneo fue QR, manual, o sincronizado
-- despues de haberse validado offline.
begin;

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
  -- 6. Buscamos la entrada y BLOQUEAMOS esa fila
  --
  -- Esto impide que dos celulares validen
  -- la misma entrada simultáneamente.
  -- =======================================================

  select
    t.id,
    t.status,
    t.used_at,

    b.first_name || ' ' || b.last_name,
    b.dni,
    tt.name

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

  join public.ticket_types tt
    on tt.id = t.ticket_type_id

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
