-- La comision de un RRPP se recalculaba siempre con el % VIGENTE de
-- event_staff.commission_percentage, nunca con el que regia al momento de
-- cada venta. Si el organizador editaba el % despues (para subirlo o
-- bajarlo), los informes de ventas YA CERRADAS cambiaban retroactivamente
-- sin que quedara ningun registro de que eso paso.
--
-- Fix: se congela el % en sales.commission_percentage_snapshot al momento
-- de la venta (mismo principio que ya se aplica a total_minor). Las ventas
-- ya existentes quedan con este campo en null -- los informes usan el %
-- vigente como fallback solo para esas, asi los numeros que ya se
-- mostraban hoy no cambian de golpe; de aca en adelante, toda venta nueva
-- de un RRPP queda con su propio % fijo para siempre.
begin;

alter table public.sales
  add column if not exists commission_percentage_snapshot numeric;

create or replace function public.create_sale(
  p_event_id uuid, p_ticket_type_id uuid, p_quantity integer,
  p_buyer_first_name text, p_buyer_last_name text, p_buyer_dni text, p_buyer_phone text,
  p_buyer_email text default null, p_payment_method text default null, p_pack_id uuid default null,
  p_idempotency_key uuid default null
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
  v_commission_percentage numeric;

  v_buyer_id uuid;
  v_sale_id uuid;
  v_sale_item_id uuid;
  v_existing_total bigint;
  v_existing_tickets integer;

  v_pack public.ticket_packs%rowtype;
  v_effective_ticket_type_id uuid;
  v_effective_quantity integer;
  v_unit_price_for_items bigint;

  v_total bigint;
begin
  if p_idempotency_key is not null then
    select s.id, s.buyer_id, s.total_minor into v_sale_id, v_buyer_id, v_existing_total
    from public.sales s where s.idempotency_key = p_idempotency_key;
    if found then
      select count(*)::integer into v_existing_tickets from public.tickets t where t.sale_id = v_sale_id;
      return query select v_sale_id, v_buyer_id, v_existing_total, v_existing_tickets;
      return;
    end if;
  end if;

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
    select es.commission_percentage into v_commission_percentage
    from public.event_staff es
    where es.event_id = p_event_id and es.organization_member_id = v_seller_member_id
      and es.staff_role = 'rrpp' and es.active = true;
    if not found then
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

  insert into public.sales (organization_id, event_id, buyer_id, seller_member_id, status, total_minor, currency, channel, payment_method, confirmed_at, idempotency_key, commission_percentage_snapshot)
  values (v_organization_id, p_event_id, v_buyer_id, v_seller_member_id, 'confirmed', v_total, v_ticket_currency, v_sale_channel, v_payment_method, now(), p_idempotency_key, case when v_sale_channel = 'rrpp' then v_commission_percentage else null end)
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

commit;

notify pgrst, 'reload schema';
