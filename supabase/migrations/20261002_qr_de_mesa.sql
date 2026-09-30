-- Las mesas compradas online (create_online_table_sale) quedaban reservadas
-- a nombre del comprador, pero nunca se les generaba una entrada/QR: la mesa
-- se controlaba solo mostrando el DNI en la puerta, y el organizador no
-- tenia forma de escanear/validar el ingreso de esa mesa como hace con
-- cualquier entrada normal. Esto le da a cada mesa vendida online su propio
-- ticket real (mismo QR firmado, mismo control de puerta, mismo email
-- automatico) -- simplemente con ticket_type_id null en vez de apuntar a una
-- tanda, distinguido por la mesa de la venta (sales.table_id).
--
-- Confirmado en vivo (consulta de diagnostico): tickets.sale_item_id,
-- tickets.ticket_type_id y tickets.manual_code son NOT NULL hoy. manual_code
-- sigue igual (tiene su propio default, nunca se lo pisa). sale_item_id y
-- ticket_type_id SI hace falta relajarlos -- una entrada de mesa nunca
-- perteneció a una tanda ni a una linea de sale_items (la venta de mesa no
-- arma sale_items).
--
-- De paso, dos bugs reales encontrados en la misma ronda de auditoria:
-- confirm_online_sale (llamada por el webhook de Mercado Pago, que puede
-- llegar minutos u horas despues de create_online_sale/create_online_table_sale,
-- por ejemplo un pago en efectivo tipo Pago Facil) solo revalidaba el CUPO
-- antes de emitir las entradas -- nunca revisaba si el evento fue cancelado
-- o la tanda pausada/desactivada mientras tanto, algo que create_sale SI
-- chequea. Y ticket_types.price_minor no tenia ningun limite en la base (solo
-- del lado del cliente en React, saltable con un POST directo a PostgREST),
-- el mismo patron que ya habia mordido una vez con "capacity" (20260998).
begin;

-- =============================================================
-- 0. tickets.sale_item_id / ticket_type_id: relajar a NULLABLE. Una entrada
--    de mesa no tiene ninguno de los dos (no pertenece a una tanda ni a una
--    linea de sale_items) -- las filas existentes no se tocan, esto solo
--    permite que una fila NUEVA los deje vacios.
-- =============================================================

alter table public.tickets alter column sale_item_id drop not null;
alter table public.tickets alter column ticket_type_id drop not null;

-- =============================================================
-- 1. confirm_online_sale: crea el ticket de la mesa al confirmar el pago,
--    y ya no confirma una venta si el evento se cancelo o la tanda se
--    pauso/desactivo mientras el pago estaba pendiente.
-- =============================================================

create or replace function public.confirm_online_sale(p_sale_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_sale public.sales%rowtype;
  v_item record;
  v_sold integer;
  v_capacity integer;
  v_event_status public.event_status;
  v_tt_active boolean;
  v_tt_status public.ticket_type_status;
begin
  select * into v_sale from public.sales where id = p_sale_id and channel = 'online' for update;
  if not found then
    raise exception 'Venta online inexistente';
  end if;

  -- Idempotente: un reintento del webhook no debe duplicar entradas ni
  -- volver a procesar una venta ya confirmada. Pero si lo que llega ahora
  -- es un reembolso/contracargo sobre esta MISMA venta ya confirmada, hay
  -- que anular las entradas en vez de ignorarlo.
  if v_sale.status = 'confirmed' then
    if p_status not in ('approved', 'pending', 'in_process', 'in_mediation', 'authorized') then
      update public.tickets set status = 'cancelled', cancelled_at = now(), updated_at = now()
      where sale_id = p_sale_id and status = 'issued';

      update public.sales set status = 'refunded', updated_at = now() where id = p_sale_id;

      for v_item in select distinct ticket_type_id from public.sale_items where sale_id = p_sale_id loop
        select capacity into v_capacity from public.ticket_types where id = v_item.ticket_type_id for update;
        select count(*)::integer into v_sold from public.tickets t
        where t.ticket_type_id = v_item.ticket_type_id and t.status <> 'cancelled';
        if v_sold < v_capacity then
          update public.ticket_types set status = 'available', updated_at = now()
          where id = v_item.ticket_type_id and status = 'sold_out';
        end if;
      end loop;
    end if;
    return;
  end if;

  -- Se procesa desde 'pending_approval' (caso normal) o 'cancelled' (el
  -- cron de 30 minutos ya la habia vencido, pero el pago aprobado llego
  -- despues -- tipico de un pago en efectivo). Cualquier otro estado no
  -- se toca.
  if v_sale.status not in ('pending_approval', 'cancelled') then
    return;
  end if;

  if p_status in ('pending', 'in_process', 'in_mediation', 'authorized') then
    -- Todavia no hay una decision final. No tocamos la venta -- ni
    -- siquiera si ya estaba 'cancelled' por el cron, para no revivirla
    -- con un estado que todavia no es definitivo.
    return;
  end if;

  if p_status <> 'approved' then
    if v_sale.status = 'pending_approval' then
      update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;
    end if;
    return;
  end if;

  -- Pago aprobado: create_online_sale/create_online_table_sale ya
  -- validaron el evento al armar el carrito, pero este pago puede llegar
  -- mucho despues (pago en efectivo, reintento de Mercado Pago) -- si el
  -- organizador cancelo el evento mientras tanto, no hay que emitir
  -- entradas para el igual solo porque el cupo todavia daba.
  select status into v_event_status from public.events where id = v_sale.event_id;
  if v_event_status not in ('upcoming', 'active') then
    update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;
    raise warning 'confirm_online_sale: el evento ya no esta activo, venta % quedo cancelada -- requiere reintegro manual', p_sale_id;
    return;
  end if;

  -- Re-verificamos cupo Y que la tanda siga activa/disponible, con lock,
  -- por cada TANDA distinta del carrito (agrupando sale_items que
  -- comparten ticket_type_id, para no subestimar cuanto pide esta venta)
  -- antes de confirmar nada -- tanto en el camino normal como al revivir
  -- una venta que el cron ya habia cancelado. El lock se toma ANTES de
  -- contar cuantas entradas ya hay vendidas: si no, dos confirmaciones
  -- simultaneas para la misma tanda pueden leer las dos el mismo conteo
  -- desactualizado mientras esperan el lock, y sobrevender.
  for v_item in
    select ticket_type_id, sum(quantity)::integer as total_quantity
    from public.sale_items
    where sale_id = p_sale_id
    group by ticket_type_id
  loop
    select capacity, active, status into v_capacity, v_tt_active, v_tt_status
    from public.ticket_types where id = v_item.ticket_type_id for update;

    if v_tt_active = false or v_tt_status = 'paused' then
      update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;
      raise warning 'confirm_online_sale: la tanda ya no esta disponible, venta % quedo cancelada -- requiere reintegro manual', p_sale_id;
      return;
    end if;

    select count(*)::integer into v_sold from public.tickets t
    where t.ticket_type_id = v_item.ticket_type_id and t.status <> 'cancelled';

    if v_sold + v_item.total_quantity > v_capacity then
      update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;
      raise warning 'confirm_online_sale: pago aprobado sin cupo disponible, venta % quedo cancelada -- requiere reintegro manual', p_sale_id;
      return;
    end if;
  end loop;

  update public.sales set status = 'confirmed', confirmed_at = now(), updated_at = now() where id = p_sale_id;

  for v_item in select * from public.sale_items where sale_id = p_sale_id loop
    insert into public.tickets (sale_item_id, sale_id, event_id, ticket_type_id, status, combo_type, combo_event_product_id, combo_remaining_quantity, combo_remaining_credit_minor)
    select v_item.id, p_sale_id, v_item.event_id, v_item.ticket_type_id, 'issued', v_item.combo_type, v_item.combo_event_product_id, v_item.combo_quantity, v_item.combo_credit_minor
    from generate_series(1, v_item.quantity);

    select count(*)::integer into v_sold from public.tickets t
    where t.ticket_type_id = v_item.ticket_type_id and t.status <> 'cancelled';

    select capacity into v_capacity from public.ticket_types where id = v_item.ticket_type_id;

    if v_sold >= v_capacity then
      update public.ticket_types set status = 'sold_out', updated_at = now() where id = v_item.ticket_type_id;
    end if;
  end loop;

  -- Venta de mesa (sin sale_items, el loop de arriba no crea nada): un
  -- unico ticket para la mesa, sin ticket_type_id -- se identifica por
  -- sales.table_id via join, no por una tanda con cupo.
  if v_sale.table_id is not null then
    insert into public.tickets (sale_id, event_id, status)
    values (p_sale_id, v_sale.event_id, 'issued');
  end if;
end;
$$;
revoke all on function public.confirm_online_sale(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_online_sale(uuid, text) to service_role;

-- =============================================================
-- 2. process_ticket_return: soporta devolver el ticket de una mesa (sin
--    sale_item_id, el precio original sale de sales.total_minor) y libera
--    la mesa de vuelta a "available" -- antes solo lo hacia el trigger de
--    cancelar la VENTA entera, no de devolver el ticket puntual.
-- =============================================================

create or replace function public.process_ticket_return(
  p_ticket_id uuid,
  p_reason text,
  p_refund_status text,
  p_refund_amount_minor bigint default null
)
returns table(
  return_id uuid,
  reason text,
  refund_status text,
  refund_amount_minor bigint,
  returned_at timestamptz,
  refunded_at timestamptz,
  ticket_display_number integer,
  ticket_status text,
  ticket_cancelled_at timestamptz,
  event_id uuid,
  event_name text
)
language plpgsql security definer set search_path = '' as $$
declare
  v_ticket_id uuid;
  v_sale_id uuid;
  v_sale_item_id uuid;
  v_event_id uuid;
  v_ticket_status text;
  v_display_number integer;
  v_ticket_type_id uuid;
  v_table_id uuid;
  v_organization_id uuid;
  v_event_name text;
  v_original_price bigint;
  v_consumed_combo_value bigint;
  v_max_refund bigint;
  v_refund_amount bigint;
  v_now timestamptz := now();
  v_return_id uuid;
  v_capacity integer;
  v_sold integer;
begin
  if p_refund_status not in ('pending', 'refunded', 'no_refund') then
    raise exception 'Indica el estado del reintegro';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Indica el motivo de la devolucion';
  end if;

  select t.id, t.sale_id, t.sale_item_id, t.event_id, t.status, t.display_number, t.ticket_type_id
  into v_ticket_id, v_sale_id, v_sale_item_id, v_event_id, v_ticket_status, v_display_number, v_ticket_type_id
  from public.tickets t
  where t.id = p_ticket_id
  for update of t;

  if not found then
    raise exception 'Entrada no encontrada';
  end if;

  select e.organization_id, e.name into v_organization_id, v_event_name
  from public.events e where e.id = v_event_id;

  select s.table_id into v_table_id from public.sales s where s.id = v_sale_id;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = v_organization_id and om.user_id = auth.uid()
      and om.role = 'organizer' and om.status = 'active'
  ) then
    raise exception 'No tenes permisos de organizador';
  end if;

  if v_ticket_status = 'used' then
    raise exception 'No se puede devolver una entrada que ya fue utilizada';
  end if;
  if v_ticket_status = 'cancelled' then
    raise exception 'Esta entrada ya esta anulada o devuelta';
  end if;
  if v_ticket_status <> 'issued' then
    raise exception 'No se puede devolver una entrada con estado "%"', v_ticket_status;
  end if;

  if exists (select 1 from public.ticket_returns tr where tr.ticket_id = p_ticket_id) then
    raise exception 'Esta entrada ya tiene una devolucion registrada';
  end if;

  -- Una entrada de mesa no tiene sale_item_id (la venta de mesa no arma
  -- sale_items): el precio original es el total de la venta, no el de una
  -- linea que no existe -- un "select ... into" contra un id null no
  -- matchea ninguna fila y dejaria v_original_price en NULL en vez de 0.
  if v_sale_item_id is not null then
    select coalesce(si.unit_price_minor, 0) into v_original_price
    from public.sale_items si where si.id = v_sale_item_id;
  else
    select coalesce(s.total_minor, 0) into v_original_price
    from public.sales s where s.id = v_sale_id;
  end if;

  select coalesce(sum(bs.total_minor), 0) into v_consumed_combo_value
  from public.bar_sales bs
  where bs.ticket_id = p_ticket_id and bs.payment_method = 'combo' and bs.cancelled_at is null;

  v_max_refund := greatest(0, v_original_price - v_consumed_combo_value);

  if p_refund_status in ('pending', 'refunded') then
    v_refund_amount := coalesce(p_refund_amount_minor, v_max_refund);
  else
    v_refund_amount := 0;
  end if;

  if v_refund_amount < 0 or v_refund_amount > v_max_refund then
    if v_consumed_combo_value > 0 then
      raise exception 'El reintegro no puede superar % (el precio original menos % ya consumidos del combo)', v_max_refund, v_consumed_combo_value;
    else
      raise exception 'El reintegro no puede superar el precio original de la entrada';
    end if;
  end if;

  insert into public.ticket_returns (organization_id, event_id, sale_id, ticket_id, reason, refund_status, refund_amount_minor, returned_by_profile_id, returned_at, refunded_at)
  values (v_organization_id, v_event_id, v_sale_id, p_ticket_id, p_reason, p_refund_status, v_refund_amount, auth.uid(), v_now, case when p_refund_status = 'refunded' then v_now else null end)
  returning id into v_return_id;

  update public.tickets set status = 'cancelled', cancelled_at = v_now, updated_at = v_now
  where id = p_ticket_id and status = 'issued';

  if not found then
    raise exception 'La entrada fue utilizada antes de completar la devolucion';
  end if;

  -- La tanda puede haber quedado "sold_out": con esta anulacion vuelve a
  -- haber lugar real. Se recuenta antes de reabrir (no a ciegas), igual que
  -- ya hace confirm_online_sale para un reembolso via Mercado Pago.
  if v_ticket_type_id is not null then
    select capacity into v_capacity from public.ticket_types where id = v_ticket_type_id for update;
    select count(*)::integer into v_sold from public.tickets t
    where t.ticket_type_id = v_ticket_type_id and t.status <> 'cancelled';
    if v_capacity is not null and v_sold < v_capacity then
      update public.ticket_types set status = 'available', updated_at = v_now
      where id = v_ticket_type_id and status = 'sold_out';
    end if;
  end if;

  -- Entrada de mesa: al devolverla (la unica entrada de esa venta) la mesa
  -- vuelve a estar disponible, igual que ya pasa si se cancela la venta
  -- entera (cp_sale_table_sync), que acá no se dispara porque esto no toca
  -- sales.status.
  if v_table_id is not null then
    update public.bar_tables set status = 'available' where id = v_table_id and status = 'reserved';
  end if;

  return query
  select v_return_id, p_reason, p_refund_status, v_refund_amount, v_now,
    case when p_refund_status = 'refunded' then v_now else null end,
    v_display_number, 'cancelled'::text, v_now,
    v_event_id, v_event_name;
end;
$$;
revoke all on function public.process_ticket_return(uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function public.process_ticket_return(uuid, text, text, bigint) to service_role;

-- =============================================================
-- 3. validate_ticket_manual: reconoce el ticket de una mesa (ticket_type_id
--    null) en vez de perderlo por el INNER JOIN a ticket_types, y muestra
--    el nombre de la mesa en su lugar.
--
-- La version original (antes de 20260959) tenia solo 2 parametros
-- (p_event_id, p_manual_code); 20260959 agrego p_method con un "create or
-- replace" que, al no coincidir la firma, crea un OVERLOAD nuevo en vez de
-- reemplazarlo -- la version vieja de 2 parametros puede seguir existiendo
-- sin que nada la use, y una llamada con solo 2 argumentos (el default de
-- p_method) queda ambigua entre las dos. Se elimina esa version vieja si
-- todavia existe (no-op si ya no esta).
-- =============================================================

drop function if exists public.validate_ticket_manual(uuid, text);

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

-- =============================================================
-- 4. ticket_types.price_minor: sin este check se podia guardar un precio
--    negativo saltando la validacion de React con un POST directo a
--    PostgREST -- mismo patron que ya se arreglo para "capacity" (20260998).
--    0 se deja permitido (entradas gratis, uso real).
-- =============================================================

-- "drop ... if exists" antes: un primer intento de correr esta migracion ya
-- habia llegado a crear esta constraint antes de fallar mas abajo por otro
-- motivo, y un "add constraint" sin este guard no se puede reintentar.
alter table public.ticket_types drop constraint if exists ticket_types_price_non_negative;
alter table public.ticket_types add constraint ticket_types_price_non_negative check (price_minor >= 0) not valid;
alter table public.ticket_types validate constraint ticket_types_price_non_negative;

commit;

notify pgrst, 'reload schema';
