-- Capital Pass: combos (entrada + consumicion incluida) y packs (varias
-- entradas de una misma tanda vendidas juntas con descuento).
--
-- Combos: una tanda puede incluir, a eleccion del organizador, una
-- cantidad fija de un producto de la barra ("incluye 1 Fernet") o un
-- credito en pesos para gastar en lo que quiera. Lo incluido se congela
-- en cada entrada individual al momento de emitirla (mismo patron que ya
-- usa unit_price_minor en sale_items), y se va descontando cuando el
-- bartender canjea escaneando el mismo codigo de la entrada.
--
-- Packs: un organizador arma "Pack x4 Generales" que vende varias
-- entradas de una tanda existente como una sola compra a un precio con
-- descuento. Solo para venta en persona (organizador/RRPP/puerta) por
-- ahora, no por Mercado Pago online.
begin;

-- =============================================================
-- 1. Esquema
-- =============================================================

alter table public.ticket_types add column if not exists combo_type text;
alter table public.ticket_types add column if not exists combo_event_product_id uuid references public.event_products(id);
alter table public.ticket_types add column if not exists combo_quantity integer;
alter table public.ticket_types add column if not exists combo_credit_minor bigint;

alter table public.ticket_types drop constraint if exists ticket_types_combo_check;
alter table public.ticket_types add constraint ticket_types_combo_check check (
  (combo_type is null and combo_event_product_id is null and combo_quantity is null and combo_credit_minor is null)
  or (combo_type = 'producto' and combo_event_product_id is not null and combo_quantity > 0 and combo_credit_minor is null)
  or (combo_type = 'credito' and combo_event_product_id is null and combo_quantity is null and combo_credit_minor > 0)
);

-- Un check no puede hacer subconsultas: garantizamos con un trigger que el
-- producto elegido para el combo sea del mismo evento que la tanda.
create or replace function public.cp_check_ticket_type_combo_product()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.combo_event_product_id is not null then
    if not exists (
      select 1 from public.event_products ep
      where ep.id = new.combo_event_product_id and ep.event_id = new.event_id
    ) then
      raise exception 'El producto del combo tiene que ser del mismo evento que la tanda.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cp_ticket_type_combo_product_check on public.ticket_types;
create trigger cp_ticket_type_combo_product_check
  before insert or update on public.ticket_types
  for each row execute function public.cp_check_ticket_type_combo_product();

-- Snapshot de lo incluido en el momento de armar el carrito online -- asi
-- confirm_online_sale (que puede correr dias despues con un pago en
-- efectivo tipo Pago Facil) no tiene que releer la tanda, que pudo
-- haberse editado mientras tanto.
alter table public.sale_items add column if not exists combo_type text;
alter table public.sale_items add column if not exists combo_event_product_id uuid;
alter table public.sale_items add column if not exists combo_quantity integer;
alter table public.sale_items add column if not exists combo_credit_minor bigint;
alter table public.sale_items add column if not exists pack_id uuid;

-- Saldo real de CADA entrada individual: se copia al emitirla y se va
-- descontando en cada canje del bartender.
alter table public.tickets add column if not exists combo_remaining_quantity integer;
alter table public.tickets add column if not exists combo_remaining_credit_minor bigint;

-- Que venta de barra canjeo esta entrada (null en una venta normal en
-- efectivo/transferencia).
alter table public.bar_sales add column if not exists ticket_id uuid references public.tickets(id);
alter type public.sale_payment_method add value if not exists 'combo';

create table public.ticket_packs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  ticket_type_id uuid not null references public.ticket_types(id),
  name text not null,
  quantity_per_pack integer not null check (quantity_per_pack > 1),
  price_minor bigint not null check (price_minor > 0),
  currency text not null default 'ARS',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ticket_packs enable row level security;
revoke all on public.ticket_packs from anon, authenticated;
grant all on public.ticket_packs to service_role;

commit;

begin;

-- =============================================================
-- 2. create_sale: agrega p_pack_id, y copia el combo de la tanda a
-- cada entrada emitida.
--
-- Postgres identifica una funcion por nombre + tipos de parametros:
-- agregar un parametro (aunque tenga default) no reemplaza la version
-- anterior con CREATE OR REPLACE, crea una sobrecarga ambigua al lado.
-- Hay que borrar la version vieja de 9 parametros primero.
-- =============================================================

drop function if exists public.create_sale(uuid, uuid, integer, text, text, text, text, text, text);

create or replace function public.create_sale(
  p_event_id uuid, p_ticket_type_id uuid, p_quantity integer,
  p_buyer_first_name text, p_buyer_last_name text, p_buyer_dni text, p_buyer_phone text,
  p_buyer_email text default null, p_payment_method text default null, p_pack_id uuid default null
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

  v_buyer_id uuid;
  v_sale_id uuid;
  v_sale_item_id uuid;

  v_pack public.ticket_packs%rowtype;
  v_effective_ticket_type_id uuid;
  v_effective_quantity integer;
  v_unit_price_for_items bigint;

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

  -- Si viene un pack, la tanda y la cantidad efectiva salen de ahi (cada
  -- "unidad" de p_quantity es un pack completo -- pedir 2 de un "Pack x4"
  -- genera 8 entradas).
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
    if not exists (
      select 1 from public.event_staff es
      where es.event_id = p_event_id and es.organization_member_id = v_seller_member_id
        and es.staff_role = 'rrpp' and es.active = true
    ) then
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

  -- El metodo de pago solo aplica a ventas en persona (RRPP y puerta),
  -- donde alguien realmente cobra efectivo o transferencia. El organizador
  -- vendiendo directo desde su panel no lo necesita.
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

  insert into public.buyers (organization_id, first_name, last_name, dni, phone, email)
  values (v_organization_id, btrim(p_buyer_first_name), btrim(p_buyer_last_name), btrim(p_buyer_dni), btrim(p_buyer_phone), nullif(btrim(p_buyer_email), ''))
  returning id into v_buyer_id;

  if p_pack_id is not null then
    v_total := v_pack.price_minor * p_quantity::bigint;
    v_unit_price_for_items := round(v_pack.price_minor::numeric / v_pack.quantity_per_pack);
  else
    v_total := v_ticket_price * p_quantity::bigint;
    v_unit_price_for_items := v_ticket_price;
  end if;

  insert into public.sales (organization_id, event_id, buyer_id, seller_member_id, status, total_minor, currency, channel, payment_method, confirmed_at)
  values (v_organization_id, p_event_id, v_buyer_id, v_seller_member_id, 'confirmed', v_total, v_ticket_currency, v_sale_channel, v_payment_method, now())
  returning id into v_sale_id;

  insert into public.sale_items (sale_id, event_id, ticket_type_id, quantity, unit_price_minor, pack_id, combo_type, combo_event_product_id, combo_quantity, combo_credit_minor)
  values (v_sale_id, p_event_id, v_effective_ticket_type_id, v_effective_quantity, v_unit_price_for_items, p_pack_id, v_combo_type, v_combo_event_product_id, v_combo_quantity, v_combo_credit_minor)
  returning id into v_sale_item_id;

  insert into public.tickets (sale_item_id, sale_id, event_id, ticket_type_id, status, combo_remaining_quantity, combo_remaining_credit_minor)
  select v_sale_item_id, v_sale_id, p_event_id, v_effective_ticket_type_id, 'issued', v_combo_quantity, v_combo_credit_minor
  from generate_series(1, v_effective_quantity);

  if v_sold + v_effective_quantity >= v_ticket_capacity then
    update public.ticket_types set status = 'sold_out', updated_at = now() where id = v_effective_ticket_type_id;
  end if;

  insert into public.audit_logs (actor_user_id, organization_id, event_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), v_organization_id, p_event_id, 'SALE_CREATED', 'sale', v_sale_id,
    jsonb_build_object('quantity', v_effective_quantity, 'ticket_type_id', v_effective_ticket_type_id, 'total_minor', v_total, 'channel', v_sale_channel, 'payment_method', v_payment_method, 'pack_id', p_pack_id));

  return query select v_sale_id, v_buyer_id, v_total, v_effective_quantity;
end;
$function$;

commit;

begin;

-- =============================================================
-- 3. create_online_sale: snapshotea el combo de cada tanda en
-- sale_items, para que confirm_online_sale no tenga que releer
-- ticket_types (que pudo cambiar) cuando el pago tarda en llegar.
-- =============================================================

drop function if exists public.create_online_sale(uuid, jsonb, text, text, text, text, text);

create or replace function public.create_online_sale(
  p_event_id uuid,
  p_items jsonb,
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
  v_combo_type text;
  v_combo_event_product_id uuid;
  v_combo_quantity integer;
  v_combo_credit_minor bigint;
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

  select e.organization_id, e.status into v_organization_id, v_event_status
  from public.events e where e.id = p_event_id;

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
  values (v_organization_id, btrim(p_buyer_first_name), btrim(p_buyer_last_name), btrim(p_buyer_dni), btrim(p_buyer_phone), nullif(btrim(coalesce(p_buyer_email, '')), ''))
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

    select tt.name, tt.price_minor, tt.currency, tt.capacity, tt.active, tt.status, tt.sales_start_at, tt.sales_end_at,
      tt.combo_type, tt.combo_event_product_id, tt.combo_quantity, tt.combo_credit_minor
    into v_name, v_price, v_currency, v_capacity, v_active, v_status, v_sales_start, v_sales_end,
      v_combo_type, v_combo_event_product_id, v_combo_quantity, v_combo_credit_minor
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

    insert into public.sale_items (sale_id, event_id, ticket_type_id, quantity, unit_price_minor, combo_type, combo_event_product_id, combo_quantity, combo_credit_minor)
    values (v_sale_id, p_event_id, v_ticket_type_id, v_quantity, v_price, v_combo_type, v_combo_event_product_id, v_combo_quantity, v_combo_credit_minor)
    returning id into v_sale_item_id;

    v_total := v_total + (v_price * v_quantity);

    v_items := v_items || jsonb_build_object('ticket_type_id', v_ticket_type_id, 'name', v_name, 'quantity', v_quantity, 'unit_price_minor', v_price);
  end loop;

  update public.sales set total_minor = v_total, updated_at = now() where id = v_sale_id;

  return query select v_sale_id, v_buyer_id, v_total, v_items;
end;
$$;
revoke all on function public.create_online_sale(uuid, jsonb, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_online_sale(uuid, jsonb, text, text, text, text, text) to service_role;

-- =============================================================
-- 4. confirm_online_sale: copia el combo ya snapshotado en
-- sale_items hacia cada entrada emitida.
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

  if v_sale.status = 'confirmed' then
    return;
  end if;

  if v_sale.status not in ('pending_approval', 'cancelled') then
    return;
  end if;

  if p_status in ('pending', 'in_process', 'in_mediation', 'authorized') then
    return;
  end if;

  if p_status <> 'approved' then
    if v_sale.status = 'pending_approval' then
      update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;
    end if;
    return;
  end if;

  for v_item in select * from public.sale_items where sale_id = p_sale_id loop
    select count(*)::integer into v_sold from public.tickets t
    where t.ticket_type_id = v_item.ticket_type_id and t.status <> 'cancelled';

    select capacity into v_capacity from public.ticket_types where id = v_item.ticket_type_id for update;

    if v_sold + v_item.quantity > v_capacity then
      update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;
      raise warning 'confirm_online_sale: pago aprobado sin cupo disponible, venta % quedo cancelada -- requiere reintegro manual', p_sale_id;
      return;
    end if;
  end loop;

  update public.sales set status = 'confirmed', confirmed_at = now(), updated_at = now() where id = p_sale_id;

  for v_item in select * from public.sale_items where sale_id = p_sale_id loop
    insert into public.tickets (sale_item_id, sale_id, event_id, ticket_type_id, status, combo_remaining_quantity, combo_remaining_credit_minor)
    select v_item.id, p_sale_id, v_item.event_id, v_item.ticket_type_id, 'issued', v_item.combo_quantity, v_item.combo_credit_minor
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
-- 5. redeem_combo_ticket: el bartender escanea/ingresa el mismo
-- codigo de la entrada para canjear lo que tenga incluido.
-- =============================================================

create or replace function public.redeem_combo_ticket(
  p_bar_id uuid, p_manual_code text, p_event_product_id uuid, p_quantity integer
)
returns table(
  ticket_id uuid, product_name text, quantity integer,
  remaining_quantity integer, remaining_credit_minor bigint,
  buyer_name text
)
language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_organization_id uuid;
  v_bartender_member_id uuid;
  v_code text;
  v_ticket_row_id uuid;
  v_ticket_status public.ticket_status;
  v_combo_type text;
  v_combo_event_product_id uuid;
  v_remaining_quantity integer;
  v_remaining_credit_minor bigint;
  v_buyer_name text;
  v_bar_stock integer;
  v_sale_price bigint;
  v_product_name text;
  v_cost bigint;
  v_bar_sale_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity > 20 then
    raise exception 'Cantidad invalida';
  end if;

  select b.event_id, e.organization_id into v_event_id, v_organization_id
  from public.bars b join public.events e on e.id = b.event_id
  where b.id = p_bar_id;
  if not found then
    raise exception 'La barra no existe';
  end if;

  if not public.is_platform_admin() and not public.cp_org_has_stock_access(v_organization_id) then
    raise exception 'La organizacion no tiene acceso al modulo de stock.';
  end if;

  select om.id into v_bartender_member_id
  from public.organization_members om
  join public.event_staff es on es.organization_member_id = om.id
  where om.organization_id = v_organization_id and om.user_id = auth.uid()
    and om.role = 'bartender' and om.status = 'active'
    and es.event_id = v_event_id and es.staff_role = 'bartender' and es.active = true
    and es.bar_id = p_bar_id
  limit 1;
  if v_bartender_member_id is null then
    raise exception 'No estas asignado a esta barra';
  end if;

  v_code := upper(btrim(p_manual_code));
  if v_code = '' then
    raise exception 'Ingresa el codigo de la entrada';
  end if;

  select t.id, t.status, tt.combo_type, tt.combo_event_product_id,
    t.combo_remaining_quantity, t.combo_remaining_credit_minor,
    b.first_name || ' ' || b.last_name
  into v_ticket_row_id, v_ticket_status, v_combo_type, v_combo_event_product_id,
    v_remaining_quantity, v_remaining_credit_minor, v_buyer_name
  from public.tickets t
  join public.ticket_types tt on tt.id = t.ticket_type_id
  join public.sales s on s.id = t.sale_id
  join public.buyers b on b.id = s.buyer_id
  where t.event_id = v_event_id and upper(t.manual_code) = v_code
  for update of t;

  if not found then
    raise exception 'No se encontro ninguna entrada con ese codigo';
  end if;
  if v_ticket_status = 'cancelled' then
    raise exception 'Esta entrada fue anulada';
  end if;
  if v_combo_type is null then
    raise exception 'Esta entrada no incluye consumicion';
  end if;

  select ep.sale_price_minor, p.name into v_sale_price, v_product_name
  from public.event_products ep
  join public.products p on p.id = ep.product_id
  where ep.id = p_event_product_id and ep.event_id = v_event_id;
  if not found then
    raise exception 'El producto no existe para este evento';
  end if;

  if v_combo_type = 'producto' then
    if p_event_product_id <> v_combo_event_product_id then
      raise exception 'Esta entrada no incluye ese producto';
    end if;
    if coalesce(v_remaining_quantity, 0) < p_quantity then
      raise exception 'Ya se canjeo todo lo incluido en esta entrada. Quedan: %', coalesce(v_remaining_quantity, 0);
    end if;
  else
    v_cost := v_sale_price * p_quantity;
    if coalesce(v_remaining_credit_minor, 0) < v_cost then
      raise exception 'No queda suficiente credito en esta entrada. Quedan: %', coalesce(v_remaining_credit_minor, 0);
    end if;
  end if;

  select bar_stock.quantity into v_bar_stock from public.bar_stock
  where bar_id = p_bar_id and event_product_id = p_event_product_id
  for update;
  if not found or v_bar_stock < p_quantity then
    raise exception 'No hay suficiente stock en esta barra. Disponible: %', coalesce(v_bar_stock, 0);
  end if;

  update public.bar_stock set quantity = bar_stock.quantity - p_quantity, updated_at = now()
  where bar_id = p_bar_id and event_product_id = p_event_product_id;

  if v_combo_type = 'producto' then
    update public.tickets set combo_remaining_quantity = combo_remaining_quantity - p_quantity, updated_at = now()
    where id = v_ticket_row_id
    returning combo_remaining_quantity, combo_remaining_credit_minor into v_remaining_quantity, v_remaining_credit_minor;
  else
    update public.tickets set combo_remaining_credit_minor = combo_remaining_credit_minor - v_cost, updated_at = now()
    where id = v_ticket_row_id
    returning combo_remaining_quantity, combo_remaining_credit_minor into v_remaining_quantity, v_remaining_credit_minor;
  end if;

  insert into public.bar_sales (event_id, bar_id, bartender_member_id, table_id, event_product_id, quantity, unit_price_minor, total_minor, payment_method, ticket_id)
  values (v_event_id, p_bar_id, v_bartender_member_id, null, p_event_product_id, p_quantity, v_sale_price, v_sale_price * p_quantity, 'combo', v_ticket_row_id)
  returning id into v_bar_sale_id;

  insert into public.stock_movements (event_id, event_product_id, bar_id, type, quantity, actor_user_id)
  values (v_event_id, p_event_product_id, p_bar_id, 'venta', p_quantity, auth.uid());

  return query select v_ticket_row_id, v_product_name, p_quantity, v_remaining_quantity, v_remaining_credit_minor, v_buyer_name;
end;
$$;
revoke all on function public.redeem_combo_ticket(uuid, text, uuid, integer) from public, anon;
grant execute on function public.redeem_combo_ticket(uuid, text, uuid, integer) to authenticated;

commit;
