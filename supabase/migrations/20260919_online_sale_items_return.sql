-- Capital Pass: create_online_sale debe devolver el detalle de items que
-- realmente valido y reservo (nombre + precio leidos con el mismo lock que
-- valida el cupo), no que el caller los vuelva a leer aparte. Si alguien
-- edita el precio de una tanda justo en el medio de un checkout, el monto
-- que Mercado Pago le muestra al comprador y el monto que despues verifica
-- el webhook deben salir siempre de esta misma lectura.
begin;

-- Postgres no permite cambiar las columnas de RETURNS TABLE con CREATE OR
-- REPLACE; hay que borrar la version anterior primero.
drop function if exists public.create_online_sale(uuid, jsonb, text, text, text, text, text);

create or replace function public.create_online_sale(
  p_event_id uuid,
  p_items jsonb, -- [{ "ticket_type_id": "...", "quantity": 2 }, ...]
  p_buyer_first_name text,
  p_buyer_last_name text,
  p_buyer_dni text,
  p_buyer_phone text,
  p_buyer_email text default null
)
returns table(sale_id uuid, buyer_id uuid, total_minor bigint, items jsonb)
language plpgsql security definer set search_path = '' as $$
declare
  v_organization_id uuid;
  v_event_status public.event_status;

  v_buyer_id uuid;
  v_sale_id uuid;
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;

  v_item jsonb;
  v_ticket_type_id uuid;
  v_quantity integer;

  v_name text;
  v_price bigint;
  v_currency text;
  v_capacity integer;
  v_active boolean;
  v_status public.ticket_type_status;
  v_sales_start timestamptz;
  v_sales_end timestamptz;

  v_sold integer;
  v_pending integer;
  v_sale_item_id uuid;
begin
  if not exists (
    select 1 from public.events e where e.id = p_event_id
      and public.cp_org_has_service(e.organization_id)
  ) then
    raise exception 'La organizacion necesita una suscripcion activa.';
  end if;

  select e.organization_id, e.status
  into v_organization_id, v_event_status
  from public.events e
  where e.id = p_event_id;

  if not found then
    raise exception 'El evento no existe';
  end if;

  if v_event_status not in ('upcoming', 'active') then
    raise exception 'Este evento no esta habilitado para vender entradas';
  end if;

  if not exists (select 1 from public.organization_mercadopago_accounts where organization_id = v_organization_id) then
    raise exception 'El organizador todavia no conecto su cuenta de Mercado Pago';
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

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito esta vacio';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'Demasiados tipos de entrada en un mismo carrito';
  end if;

  insert into public.buyers (organization_id, first_name, last_name, dni, phone, email)
  values (
    v_organization_id, btrim(p_buyer_first_name), btrim(p_buyer_last_name),
    btrim(p_buyer_dni), btrim(p_buyer_phone), nullif(btrim(coalesce(p_buyer_email, '')), '')
  )
  returning id into v_buyer_id;

  insert into public.sales (organization_id, event_id, buyer_id, seller_member_id, status, total_minor, currency, channel)
  values (v_organization_id, p_event_id, v_buyer_id, null, 'pending_approval', 0, 'ARS', 'online')
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_ticket_type_id := (v_item->>'ticket_type_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    if v_quantity is null or v_quantity <= 0 or v_quantity > 20 then
      raise exception 'Cantidad invalida en el carrito';
    end if;

    select tt.name, tt.price_minor, tt.currency, tt.capacity, tt.active, tt.status, tt.sales_start_at, tt.sales_end_at
    into v_name, v_price, v_currency, v_capacity, v_active, v_status, v_sales_start, v_sales_end
    from public.ticket_types tt
    where tt.id = v_ticket_type_id and tt.event_id = p_event_id
    for update of tt;

    if not found then
      raise exception 'La tanda no existe para este evento';
    end if;
    if v_active = false then
      raise exception 'Esta tanda esta deshabilitada';
    end if;
    if v_status <> 'available' then
      raise exception 'Esta tanda no esta disponible';
    end if;
    if v_sales_start is not null and now() < v_sales_start then
      raise exception 'La venta de esta tanda todavia no comenzo';
    end if;
    if v_sales_end is not null and now() > v_sales_end then
      raise exception 'La venta de esta tanda ya finalizo';
    end if;

    select count(*)::integer into v_sold
    from public.tickets t
    where t.ticket_type_id = v_ticket_type_id and t.status <> 'cancelled';

    -- Reserva efimera: otros carritos online todavia sin confirmar (o rechazar)
    -- tambien cuentan cupo, para no sobrevender mientras alguien tiene el
    -- checkout de Mercado Pago abierto. Se limpian solos a los 30 minutos
    -- (public.cp_cancel_stale_online_sales, via cron).
    select coalesce(sum(si.quantity), 0)::integer into v_pending
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where si.ticket_type_id = v_ticket_type_id
      and s.status = 'pending_approval'
      and s.channel = 'online'
      and s.created_at > now() - interval '30 minutes';

    if v_sold + v_pending + v_quantity > v_capacity then
      raise exception 'No hay suficientes entradas disponibles. Disponibles: %', greatest(v_capacity - v_sold - v_pending, 0);
    end if;

    insert into public.sale_items (sale_id, event_id, ticket_type_id, quantity, unit_price_minor)
    values (v_sale_id, p_event_id, v_ticket_type_id, v_quantity, v_price)
    returning id into v_sale_item_id;

    v_total := v_total + (v_price * v_quantity);

    v_items := v_items || jsonb_build_object(
      'ticket_type_id', v_ticket_type_id,
      'name', v_name,
      'quantity', v_quantity,
      'unit_price_minor', v_price
    );
  end loop;

  update public.sales set total_minor = v_total, updated_at = now() where id = v_sale_id;

  return query select v_sale_id, v_buyer_id, v_total, v_items;
end;
$$;
revoke all on function public.create_online_sale(uuid, jsonb, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_online_sale(uuid, jsonb, text, text, text, text, text) to service_role;

-- confirm_online_sale cancelaba la venta ante CUALQUIER estado que no fuera
-- 'approved' -- eso incluye 'pending'/'in_process', que es el estado normal
-- y transitorio de un pago en efectivo (Pago Facil/Rapipago) recien creado.
-- Mercado Pago avisa primero en 'pending' y recien mas tarde, cuando la
-- persona paga en el kiosco, en 'approved'. Cancelar en el primer aviso
-- dejaba la venta en 'cancelled' para siempre: el aviso de aprobacion
-- posterior llegaba, pero la venta ya no estaba en 'pending_approval' asi
-- que se ignoraba silenciosamente y la entrada nunca se emitia aunque la
-- persona si pago. Ahora solo cancela ante un estado realmente terminal
-- negativo; un 'pending'/'in_process' no hace nada, deja la venta esperando
-- la proxima notificacion.
create or replace function public.confirm_online_sale(p_sale_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_sale public.sales%rowtype;
  v_item record;
  v_sold integer;
  v_capacity integer;
begin
  select * into v_sale from public.sales where id = p_sale_id and channel = 'online' for update;
  if not found then
    raise exception 'Venta online inexistente';
  end if;

  -- Idempotente: un reintento del webhook no debe duplicar entradas.
  if v_sale.status <> 'pending_approval' then
    return;
  end if;

  if p_status in ('pending', 'in_process', 'in_mediation', 'authorized') then
    -- Todavia no hay una decision final (ej: efectivo sin pagar aun en el
    -- kiosco). No tocamos la venta; esperamos la proxima notificacion.
    return;
  end if;

  if p_status <> 'approved' then
    update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;
    return;
  end if;

  update public.sales set status = 'confirmed', confirmed_at = now(), updated_at = now() where id = p_sale_id;

  for v_item in select * from public.sale_items where sale_id = p_sale_id loop
    insert into public.tickets (sale_item_id, sale_id, event_id, ticket_type_id, status)
    select v_item.id, p_sale_id, v_item.event_id, v_item.ticket_type_id, 'issued'
    from generate_series(1, v_item.quantity);

    select count(*)::integer into v_sold from public.tickets t
    where t.ticket_type_id = v_item.ticket_type_id and t.status <> 'cancelled';

    select capacity into v_capacity from public.ticket_types where id = v_item.ticket_type_id;

    if v_sold >= v_capacity then
      update public.ticket_types set status = 'sold_out', updated_at = now() where id = v_item.ticket_type_id;
    end if;
  end loop;
end;
$$;
revoke all on function public.confirm_online_sale(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_online_sale(uuid, text) to service_role;

commit;
