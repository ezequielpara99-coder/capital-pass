-- Bug real de la ronda de auditoria de la pagina publica del evento:
-- create_online_sale/create_online_table_sale solo revisaban events.status
-- ('upcoming'/'active'), pero el pase a 'finished' es 100% manual -- no hay
-- ningun cron que lo haga solo cuando pasa la fecha. Un evento que ya
-- sucedio pero el organizador todavia no marco como finalizado seguia
-- vendiendo entradas online sin ningun control, ni en la pagina (ya
-- arreglado del lado del cliente) ni en el servidor. Mismo limite que ya
-- usa el cartel de "Sucediendo ahora" (Countdown, app/e/[slug]/event-extras.tsx):
-- sin fecha de fin explicita (ends_at), se asume terminado 6 horas despues
-- del inicio.
begin;

create or replace function public.create_online_sale(
  p_event_id uuid,
  p_items jsonb,
  p_buyer_first_name text,
  p_buyer_last_name text,
  p_buyer_dni text,
  p_buyer_phone text,
  p_buyer_email text default null,
  p_idempotency_key uuid default null
)
returns table(sale_id uuid, buyer_id uuid, total_minor bigint, items jsonb, already_existed boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_organization_id uuid;
  v_event_status public.event_status;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_buyer_id uuid;
  v_sale_id uuid;
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_pack_id uuid;
  v_pack public.ticket_packs%rowtype;
  v_ticket_type_id uuid;
  v_effective_ticket_type_id uuid;
  v_quantity integer;
  v_effective_quantity integer;
  v_name text;
  v_price bigint;
  v_currency text;
  v_capacity integer;
  v_active boolean;
  v_status public.ticket_type_status;
  v_sales_start timestamptz;
  v_sales_end timestamptz;
  v_combo_type text;
  v_combo_event_product_id uuid;
  v_combo_quantity integer;
  v_combo_credit_minor bigint;
  v_sold integer;
  v_pending integer;
  v_sale_item_id uuid;
  v_display_name text;
  v_unit_price_for_item bigint;
  v_item_total bigint;
begin
  -- Reintento con la misma clave: devuelve la venta ya creada, no duplica
  -- ni la reserva de cupo ni la venta.
  if p_idempotency_key is not null then
    -- Calificado con "s.": returns table(...) crea una variable "buyer_id"
    -- implicita (el OUT param), que sin calificar es ambigua con la
    -- columna sales.buyer_id.
    select s.id, s.buyer_id, s.total_minor into v_sale_id, v_buyer_id, v_total
    from public.sales s where s.idempotency_key = p_idempotency_key;
    if found then
      select coalesce(jsonb_agg(jsonb_build_object(
        'ticket_type_id', si.ticket_type_id, 'name', coalesce(tp.name, tt.name), 'quantity', si.quantity,
        'unit_price_minor', si.unit_price_minor, 'line_total_minor', coalesce(si.line_total_minor, si.unit_price_minor * si.quantity),
        'pack_id', si.pack_id
      ) order by si.id), '[]'::jsonb)
      into v_items
      from public.sale_items si
      left join public.ticket_types tt on tt.id = si.ticket_type_id
      left join public.ticket_packs tp on tp.id = si.pack_id
      where si.sale_id = v_sale_id;
      return query select v_sale_id, v_buyer_id, v_total, v_items, true;
      return;
    end if;
  end if;

  -- El "select ... into" de arriba, cuando no encuentra nada (primer
  -- intento con esta clave, o sin clave), igual asigna sus variables
  -- destino -- las deja en NULL. Sin este reset, "v_total := v_total +
  -- v_item_total" mas abajo se vuelve NULL desde el primer item (NULL +
  -- numero = NULL) y la venta se guardaba con total_minor = NULL.
  v_total := 0;

  if not exists (
    select 1 from public.events e where e.id = p_event_id
      and public.cp_org_has_service(e.organization_id)
  ) then
    raise exception 'La organizacion necesita una suscripcion activa.';
  end if;

  select e.organization_id, e.status, e.starts_at, e.ends_at
  into v_organization_id, v_event_status, v_starts_at, v_ends_at
  from public.events e where e.id = p_event_id;

  if not found then
    raise exception 'El evento no existe';
  end if;
  if v_event_status not in ('upcoming', 'active') then
    raise exception 'Este evento no esta habilitado para vender entradas';
  end if;
  if now() >= coalesce(v_ends_at, v_starts_at + interval '6 hours') then
    raise exception 'Este evento ya finalizo';
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
  values (v_organization_id, btrim(p_buyer_first_name), btrim(p_buyer_last_name), btrim(p_buyer_dni), btrim(p_buyer_phone), nullif(btrim(coalesce(p_buyer_email, '')), ''))
  returning id into v_buyer_id;

  insert into public.sales (organization_id, event_id, buyer_id, seller_member_id, status, total_minor, currency, channel, idempotency_key)
  values (v_organization_id, p_event_id, v_buyer_id, null, 'pending_approval', 0, 'ARS', 'online', p_idempotency_key)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pack_id := nullif(v_item->>'pack_id', '')::uuid;
    v_ticket_type_id := nullif(v_item->>'ticket_type_id', '')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    if v_quantity is null or v_quantity <= 0 or v_quantity > 20 then
      raise exception 'Cantidad invalida en el carrito';
    end if;

    if v_pack_id is not null then
      select * into v_pack from public.ticket_packs
      where id = v_pack_id and event_id = p_event_id and active = true;
      if not found then
        raise exception 'El pack no existe o no esta disponible para este evento';
      end if;
      v_effective_ticket_type_id := v_pack.ticket_type_id;
      v_effective_quantity := v_pack.quantity_per_pack * v_quantity;
    else
      v_effective_ticket_type_id := v_ticket_type_id;
      v_effective_quantity := v_quantity;
    end if;

    if v_effective_quantity > 100 then
      raise exception 'No se pueden comprar mas de 100 entradas en una sola operacion';
    end if;

    select tt.name, tt.price_minor, tt.currency, tt.capacity, tt.active, tt.status, tt.sales_start_at, tt.sales_end_at,
      tt.combo_type, tt.combo_event_product_id, tt.combo_quantity, tt.combo_credit_minor
    into v_name, v_price, v_currency, v_capacity, v_active, v_status, v_sales_start, v_sales_end,
      v_combo_type, v_combo_event_product_id, v_combo_quantity, v_combo_credit_minor
    from public.ticket_types tt
    where tt.id = v_effective_ticket_type_id and tt.event_id = p_event_id
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
    where t.ticket_type_id = v_effective_ticket_type_id and t.status <> 'cancelled';

    select coalesce(sum(si.quantity), 0)::integer into v_pending
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where si.ticket_type_id = v_effective_ticket_type_id
      and s.status = 'pending_approval'
      and s.channel = 'online'
      and s.created_at > now() - interval '30 minutes';

    if v_sold + v_pending + v_effective_quantity > v_capacity then
      raise exception 'No hay suficientes entradas disponibles. Disponibles: %', greatest(v_capacity - v_sold - v_pending, 0);
    end if;

    if v_pack_id is not null then
      v_item_total := v_pack.price_minor * v_quantity::bigint;
      v_unit_price_for_item := round(v_pack.price_minor::numeric / v_pack.quantity_per_pack);
      v_display_name := v_pack.name;
    else
      v_item_total := v_price * v_effective_quantity::bigint;
      v_unit_price_for_item := v_price;
      v_display_name := v_name;
    end if;

    insert into public.sale_items (sale_id, event_id, ticket_type_id, quantity, unit_price_minor, line_total_minor, pack_id, combo_type, combo_event_product_id, combo_quantity, combo_credit_minor)
    values (v_sale_id, p_event_id, v_effective_ticket_type_id, v_effective_quantity, v_unit_price_for_item, v_item_total, v_pack_id, v_combo_type, v_combo_event_product_id, v_combo_quantity, v_combo_credit_minor)
    returning id into v_sale_item_id;

    v_total := v_total + v_item_total;

    v_items := v_items || jsonb_build_object('ticket_type_id', v_effective_ticket_type_id, 'name', v_display_name, 'quantity', v_effective_quantity, 'unit_price_minor', v_unit_price_for_item, 'line_total_minor', v_item_total, 'pack_id', v_pack_id);
  end loop;

  update public.sales set total_minor = v_total, updated_at = now() where id = v_sale_id;

  return query select v_sale_id, v_buyer_id, v_total, v_items, false;
end;
$$;

create or replace function public.create_online_table_sale(
  p_event_id uuid,
  p_table_id uuid,
  p_buyer_first_name text,
  p_buyer_last_name text,
  p_buyer_dni text,
  p_buyer_phone text,
  p_buyer_email text default null,
  p_idempotency_key uuid default null
)
returns table(sale_id uuid, buyer_id uuid, total_minor bigint, table_name text, already_existed boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org_id uuid;
  v_event_status public.event_status;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_name text;
  v_price bigint;
  v_status text;
  v_buyer_id uuid;
  v_sale_id uuid;
  v_total bigint;
begin
  if p_idempotency_key is not null then
    select s.id, s.buyer_id, s.total_minor, bt.name
    into v_sale_id, v_buyer_id, v_total, v_name
    from public.sales s
    left join public.bar_tables bt on bt.id = s.table_id
    where s.idempotency_key = p_idempotency_key;
    if found then
      return query select v_sale_id, v_buyer_id, v_total, v_name, true;
      return;
    end if;
  end if;

  select e.organization_id, e.status, e.starts_at, e.ends_at
  into v_org_id, v_event_status, v_starts_at, v_ends_at
  from public.events e where e.id = p_event_id;
  if v_org_id is null then
    raise exception 'El evento no existe';
  end if;

  if not public.cp_org_has_service(v_org_id) then
    raise exception 'La organizacion necesita una suscripcion activa.';
  end if;
  if v_event_status not in ('upcoming', 'active') then
    raise exception 'Este evento no esta habilitado para reservar mesas';
  end if;
  if now() >= coalesce(v_ends_at, v_starts_at + interval '6 hours') then
    raise exception 'Este evento ya finalizo';
  end if;
  if not exists (select 1 from public.organization_mercadopago_accounts where organization_id = v_org_id) then
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

  select bt.name, coalesce(bt.price_minor, 0), bt.status into v_name, v_price, v_status
  from public.bar_tables bt
  where bt.id = p_table_id and bt.event_id = p_event_id
  for update;

  if not found then
    raise exception 'La mesa no existe para este evento';
  end if;
  if v_price <= 0 then
    raise exception 'Esta mesa no se puede reservar online';
  end if;
  if v_status <> 'available' then
    raise exception 'Esa mesa ya no esta disponible';
  end if;

  insert into public.buyers (organization_id, first_name, last_name, dni, phone, email)
  values (v_org_id, btrim(p_buyer_first_name), btrim(p_buyer_last_name), btrim(p_buyer_dni), btrim(p_buyer_phone), nullif(btrim(coalesce(p_buyer_email, '')), ''))
  returning id into v_buyer_id;

  insert into public.sales (organization_id, event_id, buyer_id, seller_member_id, status, total_minor, currency, channel, table_id, idempotency_key)
  values (v_org_id, p_event_id, v_buyer_id, null, 'pending_approval', v_price, 'ARS', 'online', p_table_id, p_idempotency_key)
  returning id into v_sale_id;

  update public.bar_tables set status = 'reserved' where id = p_table_id;

  return query select v_sale_id, v_buyer_id, v_price, v_name, false;
end;
$function$;

commit;

notify pgrst, 'reload schema';
