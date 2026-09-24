-- Devolver una entrada con combo tenia una ventana de carrera: el monto a
-- reintegrar se calculaba leyendo bar_sales (consumo ya canjeado en la
-- barra) SIN bloquear la fila de la entrada, y recien mas tarde -- ya con
-- el monto calculado -- se anulaba el ticket. Si un bartender canjeaba el
-- combo justo en el medio (redeem_combo_ticket SI toma "for update" sobre
-- el ticket, pero eso no protege nada si el que devuelve todavia no tomo
-- ningun lock), el reintegro se calculaba sin descontar ese canje -- el
-- comprador se quedaba con el producto Y con la plata completa de vuelta.
--
-- Fix: toda la operacion pasa a una sola funcion (mismo patron que
-- redeem_combo_ticket/cancel_bar_sale/validate_ticket_manual), que toma el
-- lock de la entrada PRIMERO -- lo mismo que ya hace redeem_combo_ticket
-- sobre esa misma fila. Postgres serializa las dos transacciones: la que
-- llega primero termina antes de que la otra pueda ni leer el estado, asi
-- que el calculo del reintegro nunca puede quedar desactualizado.
begin;

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
  v_organization_id uuid;
  v_event_name text;
  v_original_price bigint;
  v_consumed_combo_value bigint;
  v_max_refund bigint;
  v_refund_amount bigint;
  v_now timestamptz := now();
  v_return_id uuid;
begin
  if p_refund_status not in ('pending', 'refunded', 'no_refund') then
    raise exception 'Indica el estado del reintegro';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Indica el motivo de la devolucion';
  end if;

  -- Lock de la entrada PRIMERO: mientras dure esta transaccion, ningun
  -- redeem_combo_ticket sobre la MISMA entrada puede avanzar (toma el
  -- mismo "for update"), asi que lo que se lea de bar_sales mas abajo no
  -- puede quedar desactualizado por un canje que entre en el medio.
  select t.id, t.sale_id, t.sale_item_id, t.event_id, t.status, t.display_number
  into v_ticket_id, v_sale_id, v_sale_item_id, v_event_id, v_ticket_status, v_display_number
  from public.tickets t
  where t.id = p_ticket_id
  for update of t;

  if not found then
    raise exception 'Entrada no encontrada';
  end if;

  select e.organization_id, e.name into v_organization_id, v_event_name
  from public.events e where e.id = v_event_id;

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

  select coalesce(si.unit_price_minor, 0) into v_original_price
  from public.sale_items si where si.id = v_sale_item_id;

  -- bar_sales.total_minor de cada canje activo (payment_method 'combo', no
  -- cancelado) ya refleja el valor entregado en ambos tipos de combo
  -- (producto o credito) -- sumarlo alcanza sin distinguirlos.
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

  -- Bajo el lock tomado arriba, la entrada no puede haber cambiado de
  -- estado desde el chequeo de mas arriba -- este update siempre deberia
  -- afectar una fila. Se deja la condicion igual como defensa: si por
  -- cualquier motivo no afecta nada, toda la transaccion se aborta (el
  -- insert de arriba tambien se deshace) en vez de dejar una devolucion
  -- registrada sin anular la entrada.
  update public.tickets set status = 'cancelled', cancelled_at = v_now, updated_at = v_now
  where id = p_ticket_id and status = 'issued';

  if not found then
    raise exception 'La entrada fue utilizada antes de completar la devolucion';
  end if;

  return query
  select v_return_id, p_reason, p_refund_status, v_refund_amount, v_now,
    case when p_refund_status = 'refunded' then v_now else null end,
    v_display_number, 'cancelled'::text, v_now,
    v_event_id, v_event_name;
end;
$$;

revoke all on function public.process_ticket_return(uuid, text, text, bigint) from public, anon;
grant execute on function public.process_ticket_return(uuid, text, text, bigint) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
