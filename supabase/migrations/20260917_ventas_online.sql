-- Capital Pass: venta publica de entradas pagada online, directo a la cuenta
-- de Mercado Pago del organizador (Marketplace / OAuth), sin comision de
-- Capital Pass. El comprador arma un carrito en /e/[slug] y paga; recien al
-- confirmarse el pago se generan las entradas (no al crear el carrito).
-- Ejecutar una vez en Supabase SQL Editor antes de publicar el codigo.
begin;

-- =============================================================
-- 1. Cuenta de Mercado Pago conectada por organizacion (OAuth)
-- =============================================================

create table if not exists public.organization_mercadopago_accounts (
  organization_id uuid primary key references public.organizations(id),
  mp_user_id bigint not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  processing_fee_percent numeric not null default 0 check (processing_fee_percent >= 0 and processing_fee_percent < 50),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.organization_mercadopago_accounts enable row level security;
revoke all on public.organization_mercadopago_accounts from anon, authenticated;
grant all on public.organization_mercadopago_accounts to service_role;

-- =============================================================
-- 2. Ventas online: nuevo canal y vendedor opcional
-- =============================================================

alter type public.sale_channel add value if not exists 'online';
alter table public.sales alter column seller_member_id drop not null;

-- total_minor de una venta online es siempre el subtotal de las entradas
-- (lo que corresponde al organizador). total_charged_minor es lo que
-- realmente se le cobro al comprador, subtotal + el recargo por servicio
-- vigente al momento de la compra -- el webhook verifica el pago contra
-- este valor, no contra total_minor, para no rechazar pagos validos solo
-- porque el organizador cambio su % de recargo despues de la compra.
alter table public.sales add column if not exists total_charged_minor bigint;

-- =============================================================
-- 3. Crear el carrito (reserva cupo, no emite entradas todavia)
-- =============================================================

create or replace function public.create_online_sale(
  p_event_id uuid,
  p_items jsonb, -- [{ "ticket_type_id": "...", "quantity": 2 }, ...]
  p_buyer_first_name text,
  p_buyer_last_name text,
  p_buyer_dni text,
  p_buyer_phone text,
  p_buyer_email text default null
)
returns table(sale_id uuid, buyer_id uuid, total_minor bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_organization_id uuid;
  v_event_status public.event_status;

  v_buyer_id uuid;
  v_sale_id uuid;
  v_total bigint := 0;

  v_item jsonb;
  v_ticket_type_id uuid;
  v_quantity integer;

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

    select tt.price_minor, tt.currency, tt.capacity, tt.active, tt.status, tt.sales_start_at, tt.sales_end_at
    into v_price, v_currency, v_capacity, v_active, v_status, v_sales_start, v_sales_end
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
  end loop;

  update public.sales set total_minor = v_total, updated_at = now() where id = v_sale_id;

  return query select v_sale_id, v_buyer_id, v_total;
end;
$$;
revoke all on function public.create_online_sale(uuid, jsonb, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_online_sale(uuid, jsonb, text, text, text, text, text) to service_role;

-- =============================================================
-- 4. Confirmar el pago: recien aca se emiten las entradas
-- =============================================================

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

-- =============================================================
-- 5. Limpieza de carritos abandonados (via cron)
-- =============================================================

create or replace function public.cp_cancel_stale_online_sales()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  with cancelled as (
    update public.sales set status = 'cancelled', updated_at = now()
    where channel = 'online' and status = 'pending_approval'
      and created_at < now() - interval '30 minutes'
    returning id
  )
  select count(*)::integer into v_count from cancelled;
  return v_count;
end;
$$;
revoke all on function public.cp_cancel_stale_online_sales() from public, anon, authenticated;
grant execute on function public.cp_cancel_stale_online_sales() to service_role;

-- =============================================================
-- 6. create_sale (puerta/RRPP/organizador): el cupo tambien debe
-- descontar los carritos online pendientes, para no sobrevender
-- mientras alguien tiene un checkout de Mercado Pago abierto.
-- =============================================================

create or replace function public.create_sale(p_event_id uuid, p_ticket_type_id uuid, p_quantity integer, p_buyer_first_name text, p_buyer_last_name text, p_buyer_dni text, p_buyer_phone text, p_buyer_email text DEFAULT NULL::text)
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

  v_sales_start timestamptz;
  v_sales_end timestamptz;

  v_sold integer;
  v_pending integer;

  v_seller_member_id uuid;
  v_seller_role public.organization_member_role;
  v_sale_channel public.sale_channel;

  v_buyer_id uuid;
  v_sale_id uuid;
  v_sale_item_id uuid;

  v_total bigint;

begin
  if not public.is_platform_admin() and not exists (
    select 1 from public.events e where e.id = p_event_id
      and public.cp_org_has_service(e.organization_id)
  ) then
    raise exception 'La organizacion necesita una suscripcion activa.';
  end if;


  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para registrar una venta';
  end if;


  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  if p_quantity > 100 then
    raise exception 'No se pueden vender más de 100 entradas en una sola operación';
  end if;


  if p_buyer_first_name is null
     or btrim(p_buyer_first_name) = '' then
    raise exception 'El nombre del comprador es obligatorio';
  end if;

  if p_buyer_last_name is null
     or btrim(p_buyer_last_name) = '' then
    raise exception 'El apellido del comprador es obligatorio';
  end if;

  if p_buyer_dni is null
     or btrim(p_buyer_dni) = '' then
    raise exception 'El DNI del comprador es obligatorio';
  end if;

  if p_buyer_phone is null
     or btrim(p_buyer_phone) = '' then
    raise exception 'El WhatsApp del comprador es obligatorio';
  end if;


  select
    e.organization_id,
    e.status,

    e.rrpp_sales_enabled,
    e.rrpp_sales_cutoff_at,

    e.door_sales_enabled,
    e.door_sales_start_at,
    e.door_sales_end_at,

    tt.price_minor,
    tt.currency,
    tt.capacity,
    tt.active,
    tt.status,

    tt.sales_start_at,
    tt.sales_end_at

  into
    v_organization_id,
    v_event_status,

    v_rrpp_sales_enabled,
    v_rrpp_sales_cutoff_at,

    v_door_sales_enabled,
    v_door_sales_start_at,
    v_door_sales_end_at,

    v_ticket_price,
    v_ticket_currency,
    v_ticket_capacity,
    v_ticket_active,
    v_ticket_status,

    v_sales_start,
    v_sales_end

  from public.ticket_types tt

  join public.events e
    on e.id = tt.event_id

  where tt.id = p_ticket_type_id
    and tt.event_id = p_event_id

  for update of tt;


  if not found then
    raise exception 'La tanda no existe para este evento';
  end if;


  if v_event_status not in ('upcoming', 'active') then
    raise exception 'Este evento no está habilitado para vender entradas';
  end if;


  select
    om.id,
    om.role

  into
    v_seller_member_id,
    v_seller_role

  from public.organization_members om

  where om.organization_id = v_organization_id
    and om.user_id = auth.uid()
    and om.status = 'active'

  limit 1;


  if v_seller_member_id is null then
    raise exception 'No perteneces a la organización de este evento';
  end if;


  if v_seller_role = 'organizer' then

    v_sale_channel := 'organizer';


  elsif v_seller_role = 'rrpp' then

    if not exists (
      select 1
      from public.event_staff es
      where es.event_id = p_event_id
        and es.organization_member_id = v_seller_member_id
        and es.staff_role = 'rrpp'
        and es.active = true
    ) then

      raise exception 'No estás asignado como RRPP a este evento';

    end if;


    if v_rrpp_sales_enabled = false then
      raise exception 'Las ventas de RRPP están bloqueadas';
    end if;


    if v_rrpp_sales_cutoff_at is not null
       and now() > v_rrpp_sales_cutoff_at then

      raise exception 'Finalizó el horario de venta para RRPP';

    end if;


    v_sale_channel := 'rrpp';


  elsif v_seller_role = 'door_seller' then

    if not exists (
      select 1
      from public.event_staff es
      where es.event_id = p_event_id
        and es.organization_member_id = v_seller_member_id
        and es.staff_role = 'door_seller'
        and es.active = true
    ) then

      raise exception 'No estás asignado a la venta en puerta de este evento';

    end if;


    if v_event_status <> 'active' then
      raise exception 'La venta en puerta sólo está disponible con el evento activo';
    end if;


    if v_door_sales_enabled = false then
      raise exception 'La venta en puerta está deshabilitada';
    end if;


    if v_door_sales_start_at is not null
       and now() < v_door_sales_start_at then

      raise exception 'La venta en puerta todavía no comenzó';

    end if;


    if v_door_sales_end_at is not null
       and now() > v_door_sales_end_at then

      raise exception 'Finalizó el horario de venta en puerta';

    end if;


    v_sale_channel := 'door';


  else

    raise exception 'Tu usuario no tiene permiso para registrar ventas';

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


  if v_sales_start is not null
     and now() < v_sales_start then
    raise exception 'La venta de esta tanda todavía no comenzó';
  end if;

  if v_sales_end is not null
     and now() > v_sales_end then
    raise exception 'La venta de esta tanda ya finalizó';
  end if;


  select count(*)::integer
  into v_sold

  from public.tickets t

  where t.ticket_type_id = p_ticket_type_id
    and t.status <> 'cancelled';

  select coalesce(sum(si.quantity), 0)::integer into v_pending
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where si.ticket_type_id = p_ticket_type_id
    and s.status = 'pending_approval'
    and s.channel = 'online'
    and s.created_at > now() - interval '30 minutes';


  if v_sold + v_pending + p_quantity > v_ticket_capacity then

    raise exception
      'No hay suficientes entradas disponibles. Disponibles: %',
      greatest(v_ticket_capacity - v_sold - v_pending, 0);

  end if;


  insert into public.buyers (
    organization_id,
    first_name,
    last_name,
    dni,
    phone,
    email
  )

  values (
    v_organization_id,
    btrim(p_buyer_first_name),
    btrim(p_buyer_last_name),
    btrim(p_buyer_dni),
    btrim(p_buyer_phone),
    nullif(btrim(p_buyer_email), '')
  )

  returning id
  into v_buyer_id;


  v_total :=
    v_ticket_price * p_quantity::bigint;


  insert into public.sales (
    organization_id,
    event_id,
    buyer_id,
    seller_member_id,
    status,
    total_minor,
    currency,
    channel,
    confirmed_at
  )

  values (
    v_organization_id,
    p_event_id,
    v_buyer_id,
    v_seller_member_id,
    'confirmed',
    v_total,
    v_ticket_currency,
    v_sale_channel,
    now()
  )

  returning id
  into v_sale_id;


  insert into public.sale_items (
    sale_id,
    event_id,
    ticket_type_id,
    quantity,
    unit_price_minor
  )

  values (
    v_sale_id,
    p_event_id,
    p_ticket_type_id,
    p_quantity,
    v_ticket_price
  )

  returning id
  into v_sale_item_id;


  insert into public.tickets (
    sale_item_id,
    sale_id,
    event_id,
    ticket_type_id,
    status
  )

  select
    v_sale_item_id,
    v_sale_id,
    p_event_id,
    p_ticket_type_id,
    'issued'

  from generate_series(1, p_quantity);


  if v_sold + p_quantity >= v_ticket_capacity then

    update public.ticket_types

    set
      status = 'sold_out',
      updated_at = now()

    where id = p_ticket_type_id;

  end if;


  insert into public.audit_logs (
    actor_user_id,
    organization_id,
    event_id,
    action,
    entity_type,
    entity_id,
    metadata
  )

  values (
    auth.uid(),
    v_organization_id,
    p_event_id,
    'SALE_CREATED',
    'sale',
    v_sale_id,

    jsonb_build_object(
      'quantity', p_quantity,
      'ticket_type_id', p_ticket_type_id,
      'total_minor', v_total,
      'channel', v_sale_channel
    )
  );


  return query
  select
    v_sale_id,
    v_buyer_id,
    v_total,
    p_quantity;

end;
$function$;

commit;
