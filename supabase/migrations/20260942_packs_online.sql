-- Venta de packs (varias entradas de una tanda con descuento) tambien
-- online por Mercado Pago, no solo en persona. Cada item del carrito puede
-- traer un pack_id opcional: en ese caso "quantity" es la cantidad de PACKS
-- (no de entradas sueltas), igual que ya funciona en create_sale.
--
-- confirm_online_sale no necesita cambios: ya crea "sale_items.quantity"
-- entradas por item, y aca ya insertamos sale_items con la cantidad
-- EFECTIVA (pack.quantity_per_pack * cantidad de packs), igual que
-- create_sale hace para la venta en persona.
begin;

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
    v_pack_id := nullif(v_item->>'pack_id', '')::uuid;
    v_ticket_type_id := nullif(v_item->>'ticket_type_id', '')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    if v_quantity is null or v_quantity <= 0 or v_quantity > 20 then
      raise exception 'Cantidad invalida en el carrito';
    end if;

    -- Si viene un pack, la tanda y la cantidad efectiva salen de ahi (cada
    -- "unidad" de v_quantity es un pack completo).
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

    insert into public.sale_items (sale_id, event_id, ticket_type_id, quantity, unit_price_minor, pack_id, combo_type, combo_event_product_id, combo_quantity, combo_credit_minor)
    values (v_sale_id, p_event_id, v_effective_ticket_type_id, v_effective_quantity, v_unit_price_for_item, v_pack_id, v_combo_type, v_combo_event_product_id, v_combo_quantity, v_combo_credit_minor)
    returning id into v_sale_item_id;

    v_total := v_total + v_item_total;

    -- line_total_minor viaja aparte de unit_price_minor * quantity: para un
    -- pack ese producto puede no ser exacto por el redondeo del prorrateo
    -- (p.ej. 13500/4 = 3375 pero puede no ser divisible siempre), y el
    -- checkout arma la preference de Mercado Pago con line_total_minor
    -- para que el cobro real nunca se desvie del total ya validado aca.
    v_items := v_items || jsonb_build_object('ticket_type_id', v_effective_ticket_type_id, 'name', v_display_name, 'quantity', v_effective_quantity, 'unit_price_minor', v_unit_price_for_item, 'line_total_minor', v_item_total, 'pack_id', v_pack_id);
  end loop;

  update public.sales set total_minor = v_total, updated_at = now() where id = v_sale_id;

  return query select v_sale_id, v_buyer_id, v_total, v_items;
end;
$$;
revoke all on function public.create_online_sale(uuid, jsonb, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_online_sale(uuid, jsonb, text, text, text, text, text) to service_role;

commit;

notify pgrst, 'reload schema';
