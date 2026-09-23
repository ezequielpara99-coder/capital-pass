-- Bug real encontrado en revision: redeem_combo_ticket y
-- /api/stock/combo/lookup leian el combo_type/combo_event_product_id
-- EN VIVO de ticket_types (la tanda), no un snapshot por entrada. Si el
-- organizador editaba el combo de una tanda despues de haber vendido
-- entradas (por ejemplo, cambiar el producto incluido de Fernet a
-- Vodka), las entradas YA VENDIDAS con el combo viejo dejaban de poder
-- canjearse correctamente -- el bartender validaba contra la
-- configuracion nueva, no contra lo que el comprador realmente pago.
-- sale_items ya snapshotea estos campos al armar el carrito online
-- (para que confirm_online_sale no tenga que releer la tanda), pero ese
-- snapshot nunca se copiaba a la entrada final. Esto agrega el mismo
-- snapshot a tickets, igual que ya existe para combo_remaining_quantity
-- y combo_remaining_credit_minor.
begin;

alter table public.tickets add column if not exists combo_type text;
alter table public.tickets add column if not exists combo_event_product_id uuid references public.event_products(id);

-- Backfill best-effort para entradas con combo ya emitidas: no hay forma
-- de recuperar la configuracion exacta que tenia la tanda en el momento
-- de esa venta puntual, asi que se usa la configuracion actual de la
-- tanda como mejor aproximacion (es exacta salvo que el organizador ya
-- haya editado el combo de esa tanda desde que se vendieron).
update public.tickets t
set combo_type = tt.combo_type, combo_event_product_id = tt.combo_event_product_id
from public.ticket_types tt
where t.ticket_type_id = tt.id
  and t.combo_type is null
  and (t.combo_remaining_quantity is not null or t.combo_remaining_credit_minor is not null);

commit;

begin;

-- create_sale: copia combo_type/combo_event_product_id (ya resueltos en
-- v_combo_type/v_combo_event_product_id desde la tanda con lock) a cada
-- entrada emitida.
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

  insert into public.tickets (sale_item_id, sale_id, event_id, ticket_type_id, status, combo_type, combo_event_product_id, combo_remaining_quantity, combo_remaining_credit_minor)
  select v_sale_item_id, v_sale_id, p_event_id, v_effective_ticket_type_id, 'issued', v_combo_type, v_combo_event_product_id, v_combo_quantity, v_combo_credit_minor
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

-- confirm_online_sale: copia combo_type/combo_event_product_id desde el
-- snapshot que ya tiene sale_items (create_online_sale ya lo guarda ahi)
-- a cada entrada emitida.
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

  -- Pago aprobado: re-verificamos cupo con lock por cada tanda del
  -- carrito antes de confirmar nada -- tanto en el camino normal como al
  -- revivir una venta que el cron ya habia cancelado. El lock se toma
  -- ANTES de contar cuantas entradas ya hay vendidas: si no, dos
  -- confirmaciones simultaneas para la misma tanda pueden leer las dos el
  -- mismo conteo desactualizado mientras esperan el lock, y sobrevender.
  for v_item in select * from public.sale_items where sale_id = p_sale_id loop
    select capacity into v_capacity from public.ticket_types where id = v_item.ticket_type_id for update;

    select count(*)::integer into v_sold from public.tickets t
    where t.ticket_type_id = v_item.ticket_type_id and t.status <> 'cancelled';

    if v_sold + v_item.quantity > v_capacity then
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
end;
$$;
revoke all on function public.confirm_online_sale(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_online_sale(uuid, text) to service_role;

-- redeem_combo_ticket: valida contra el snapshot de la ENTRADA
-- (t.combo_type / t.combo_event_product_id), no contra la tanda en vivo.
create or replace function public.redeem_combo_ticket(
  p_bar_id uuid, p_manual_code text, p_event_product_id uuid, p_quantity integer,
  p_idempotency_key uuid default null
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
  v_existing_ticket_id uuid;
begin
  if p_idempotency_key is not null then
    select bs.ticket_id into v_existing_ticket_id
    from public.bar_sales bs where bs.idempotency_key = p_idempotency_key;
    if found then
      select p.name, t.combo_remaining_quantity, t.combo_remaining_credit_minor,
        b.first_name || ' ' || b.last_name
      into v_product_name, v_remaining_quantity, v_remaining_credit_minor, v_buyer_name
      from public.tickets t
      join public.ticket_types tt on tt.id = t.ticket_type_id
      join public.sales s on s.id = t.sale_id
      join public.buyers b on b.id = s.buyer_id
      join public.event_products ep on ep.id = p_event_product_id
      join public.products p on p.id = ep.product_id
      where t.id = v_existing_ticket_id;

      return query select v_existing_ticket_id, v_product_name, p_quantity, v_remaining_quantity, v_remaining_credit_minor, v_buyer_name;
      return;
    end if;
  end if;

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

  select t.id, t.status, t.combo_type, t.combo_event_product_id,
    t.combo_remaining_quantity, t.combo_remaining_credit_minor,
    b.first_name || ' ' || b.last_name
  into v_ticket_row_id, v_ticket_status, v_combo_type, v_combo_event_product_id,
    v_remaining_quantity, v_remaining_credit_minor, v_buyer_name
  from public.tickets t
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

  insert into public.bar_sales (event_id, bar_id, bartender_member_id, table_id, event_product_id, quantity, unit_price_minor, total_minor, payment_method, ticket_id, idempotency_key)
  values (v_event_id, p_bar_id, v_bartender_member_id, null, p_event_product_id, p_quantity, v_sale_price, v_sale_price * p_quantity, 'combo', v_ticket_row_id, p_idempotency_key)
  returning id into v_bar_sale_id;

  insert into public.stock_movements (event_id, event_product_id, bar_id, type, quantity, actor_user_id)
  values (v_event_id, p_event_product_id, p_bar_id, 'venta', p_quantity, auth.uid());

  return query select v_ticket_row_id, v_product_name, p_quantity, v_remaining_quantity, v_remaining_credit_minor, v_buyer_name;
end;
$$;
revoke all on function public.redeem_combo_ticket(uuid, text, uuid, integer, uuid) from public, anon;
grant execute on function public.redeem_combo_ticket(uuid, text, uuid, integer, uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
