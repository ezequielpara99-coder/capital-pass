-- Dos bugs reales encontrados en una ronda de auditoria sobre los pedidos de
-- la app del socio (20260988):
--
-- 1. Al entregar un pedido de consumo, si no alcanzaba el stock de barra, la
--    funcion igual marcaba el pedido como "delivered" sin avisar a nadie
--    (silencio total: ni error, ni aviso, solo "stock_deducted=false"). Con
--    2+ eventos activos o ninguno tambien se saltaba el descuento de stock
--    en silencio porque el pedido nunca guardaba a que evento pertenecia.
--    Ahora: el evento se fija al CREAR el pedido (no se re-adivina al
--    entregar), y si no alcanza el stock se lanza un error real que el
--    bartender ve en pantalla.
--
-- 2. Una mesa reservada desde la app del socio (pago en barra o con saldo)
--    nunca vencia sola si nadie la marcaba lista/entregada/cancelada -- a
--    diferencia de las ventas de mesa "online" (cp_cancel_stale_online_sales,
--    cada 10 minutos). Agrega cp_expire_stale_member_orders(), pensada para
--    correr por cron, que cancela (reembolsando saldo/puntos y liberando la
--    mesa) los pedidos que quedaron "pending" mas de N horas.
begin;

-- =============================================================
-- 1. member_place_order: fija el evento del pedido de consumo al crearlo
--    (antes quedaba siempre null; se re-adivinaba al entregar, mal).
-- =============================================================

create or replace function public.member_place_order(
  p_member_id uuid,
  p_kind text,
  p_items jsonb,
  p_payment text,
  p_table_id uuid default null,
  p_note text default null,
  p_key text default null,
  p_delivery text default null
)
returns table(order_id uuid, pickup_code text, total_minor bigint, balance_minor bigint, points_balance integer, already_existed boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org_id uuid;
  v_status text;
  v_expires date;
  v_balance bigint;
  v_points integer;
  v_first text;
  v_last text;
  v_dni text;
  v_phone text;
  v_email text;
  v_existing public.member_orders%rowtype;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_menu public.member_menu_items%rowtype;
  v_qty integer;
  v_total bigint := 0;
  v_points_cost integer := 0;
  v_points_earned integer := 0;
  v_event_id uuid;
  v_active_events integer;
  v_table_name text;
  v_table_price bigint;
  v_table_status text;
  v_event_status public.event_status;
  v_code text;
  v_order_id uuid;
  v_discount integer := 0;
  v_multiplier numeric := 1;
  v_buyer_id uuid;
  v_sale_id uuid;
begin
  if p_kind not in ('consumo', 'mesa') then
    raise exception 'Tipo de pedido invalido.';
  end if;
  if p_payment not in ('wallet', 'en_barra') then
    raise exception 'Metodo de pago invalido.';
  end if;

  select organization_id, status, expires_at, premium_members.balance_minor, premium_members.points_balance,
    first_name, last_name, dni, phone, email
  into v_org_id, v_status, v_expires, v_balance, v_points, v_first, v_last, v_dni, v_phone, v_email
  from public.premium_members
  where id = p_member_id and deleted_at is null
  for update;

  if v_org_id is null then
    raise exception 'El socio no existe.';
  end if;

  -- Reintento con la misma key: devuelve el pedido ya creado, no duplica.
  if p_key is not null and btrim(p_key) <> '' then
    select * into v_existing from public.member_orders where member_id = p_member_id and idempotency_key = p_key;
    if found then
      return query select v_existing.id, v_existing.pickup_code, v_existing.total_minor, v_balance, v_points, true;
      return;
    end if;
  end if;

  if v_status <> 'active' or (v_expires is not null and v_expires < current_date) then
    raise exception 'Tu membresia no esta activa.';
  end if;

  -- Descuento del nivel del socio (solo consumos) y puntos dobles vigentes.
  v_discount := coalesce(((public.member_level_info(p_member_id)->'level'->>'discount_percent'))::integer, 0);
  select coalesce(max(b.multiplier), 1) into v_multiplier
  from public.member_point_boosts b
  where b.organization_id = v_org_id and b.active = true and b.deleted_at is null
    and now() >= b.starts_at and now() < b.ends_at;

  if p_kind = 'consumo' then
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'El pedido esta vacio.';
    end if;
    if jsonb_array_length(p_items) > 20 then
      raise exception 'Demasiados productos en un mismo pedido.';
    end if;

    -- Se guarda a que evento pertenece el pedido DESDE que se crea (solo si
    -- hay exactamente un evento activo; si no, queda sin evento y ese pedido
    -- simplemente no vincula con stock -- misma ambiguedad de antes, pero
    -- ahora es consistente entre creacion y entrega en vez de re-adivinarse).
    select count(*), min(e.id::text)::uuid into v_active_events, v_event_id
    from public.events e where e.organization_id = v_org_id and e.status = 'active';
    if v_active_events <> 1 then
      v_event_id := null;
    end if;

    for v_item in select * from jsonb_array_elements(p_items) loop
      v_qty := (v_item->>'qty')::integer;
      if v_qty is null or v_qty <= 0 or v_qty > 20 then
        raise exception 'Cantidad invalida.';
      end if;

      select * into v_menu from public.member_menu_items
      where id = (v_item->>'id')::uuid and organization_id = v_org_id and active = true and deleted_at is null;
      if not found then
        raise exception 'Un producto del pedido ya no esta disponible.';
      end if;

      if v_menu.kind = 'premio' then
        v_points_cost := v_points_cost + v_menu.points_cost * v_qty;
      else
        v_total := v_total + v_menu.price_minor * v_qty;
        v_points_earned := v_points_earned + v_menu.points_earned * v_qty;
      end if;

      v_items := v_items || jsonb_build_object(
        'id', v_menu.id, 'name', v_menu.name, 'kind', v_menu.kind, 'qty', v_qty,
        'price_minor', v_menu.price_minor, 'points_cost', v_menu.points_cost,
        'product_id', v_menu.product_id, 'stock_units', v_menu.stock_units
      );
    end loop;

    if v_discount > 0 then
      v_total := round(v_total * (100 - v_discount) / 100.0);
    end if;
    if v_multiplier > 1 then
      v_points_earned := round(v_points_earned * v_multiplier);
    end if;
  else
    v_discount := 0;
    v_multiplier := 1;

    if p_table_id is null then
      raise exception 'Elegi una mesa.';
    end if;

    select bt.event_id, bt.name, coalesce(bt.price_minor, 0), bt.status, e.status
    into v_event_id, v_table_name, v_table_price, v_table_status, v_event_status
    from public.bar_tables bt
    join public.events e on e.id = bt.event_id
    where bt.id = p_table_id and e.organization_id = v_org_id
    for update of bt;

    if not found then
      raise exception 'La mesa no existe.';
    end if;
    if v_event_status not in ('upcoming', 'active') then
      raise exception 'Este evento ya no admite reservas.';
    end if;
    if v_table_status <> 'available' then
      raise exception 'Esa mesa ya no esta disponible.';
    end if;

    v_total := v_table_price;
    v_items := jsonb_build_array(jsonb_build_object('name', v_table_name, 'kind', 'mesa', 'qty', 1, 'price_minor', v_table_price));
    update public.bar_tables set status = 'reserved' where id = p_table_id;
  end if;

  if v_points_cost > v_points then
    raise exception 'No te alcanzan los puntos.';
  end if;

  if p_payment = 'wallet' and v_total > v_balance then
    raise exception 'Saldo insuficiente.';
  end if;

  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));

  -- Reserva de mesa pagada con saldo: ya es una venta confirmada del evento.
  if p_kind = 'mesa' and p_payment = 'wallet' and v_total > 0 then
    insert into public.buyers (organization_id, first_name, last_name, dni, phone, email)
    values (v_org_id, v_first, v_last, nullif(btrim(coalesce(v_dni, '')), ''), coalesce(v_phone, ''), nullif(btrim(coalesce(v_email, '')), ''))
    returning id into v_buyer_id;

    insert into public.sales (organization_id, event_id, buyer_id, seller_member_id, status, total_minor, currency, channel, payment_method, table_id, confirmed_at)
    values (v_org_id, v_event_id, v_buyer_id, null, 'confirmed', v_total, 'ARS', 'mesa', null, p_table_id, now())
    returning id into v_sale_id;
  end if;

  insert into public.member_orders (organization_id, member_id, event_id, table_id, kind, items, total_minor, points_cost, points_earned, payment, delivery, pickup_code, note, idempotency_key, discount_percent, boost_multiplier, sale_id)
  values (v_org_id, p_member_id, v_event_id, p_table_id, p_kind, v_items, v_total, v_points_cost, v_points_earned, p_payment,
    nullif(left(btrim(coalesce(p_delivery, '')), 80), ''), v_code,
    nullif(left(btrim(coalesce(p_note, '')), 300), ''), nullif(btrim(coalesce(p_key, '')), ''), v_discount, v_multiplier, v_sale_id)
  returning id into v_order_id;

  if p_payment = 'wallet' and v_total > 0 then
    update public.premium_members set balance_minor = premium_members.balance_minor - v_total, updated_at = now() where id = p_member_id;
    insert into public.wallet_transactions (member_id, amount_minor, kind, note)
    values (p_member_id, -v_total, 'spend', 'Pedido ' || v_code);
    v_balance := v_balance - v_total;
  end if;

  if v_points_cost > 0 then
    update public.premium_members set points_balance = premium_members.points_balance - v_points_cost, updated_at = now() where id = p_member_id;
    insert into public.member_points_transactions (member_id, order_id, delta, reason)
    values (p_member_id, v_order_id, -v_points_cost, 'Canje pedido ' || v_code);
    v_points := v_points - v_points_cost;
  end if;

  return query select v_order_id, v_code, v_total, v_balance, v_points, false;
end;
$function$;

revoke all on function public.member_place_order(uuid, text, jsonb, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.member_place_order(uuid, text, jsonb, text, uuid, text, text, text) to service_role;

-- =============================================================
-- 2. member_order_set_status: usa el evento ya guardado en el pedido (no lo
--    re-adivina) y NO entrega en silencio si no alcanza el stock.
-- =============================================================

create or replace function public.member_order_set_status(
  p_order_id uuid,
  p_status text,
  p_organization_id uuid default null,
  p_member_id uuid default null
)
returns table(new_status text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.member_orders%rowtype;
  v_item jsonb;
  v_ep_id uuid;
  v_needed integer;
  v_available bigint;
  v_take integer;
  v_bar record;
  v_deducted boolean := false;
  v_first text;
  v_last text;
  v_dni text;
  v_phone text;
  v_email text;
  v_buyer_id uuid;
  v_sale_id uuid;
begin
  if p_status not in ('ready', 'delivered', 'cancelled') then
    raise exception 'Estado invalido.';
  end if;
  if p_organization_id is null and p_member_id is null then
    raise exception 'Falta indicar quien cambia el pedido.';
  end if;

  select * into v_order from public.member_orders where id = p_order_id for update;
  if not found then
    raise exception 'El pedido no existe.';
  end if;

  if p_organization_id is not null and v_order.organization_id <> p_organization_id then
    raise exception 'No tenes permiso sobre este pedido.';
  end if;
  if p_member_id is not null then
    if v_order.member_id <> p_member_id then
      raise exception 'No tenes permiso sobre este pedido.';
    end if;
    if p_status <> 'cancelled' or v_order.status <> 'pending' then
      raise exception 'Solo podes cancelar un pedido que todavia no esta listo.';
    end if;
  end if;

  if v_order.status in ('delivered', 'cancelled') then
    raise exception 'Este pedido ya esta cerrado.';
  end if;
  if p_status = 'ready' and v_order.status <> 'pending' then
    raise exception 'El pedido ya esta listo.';
  end if;

  if p_status = 'delivered' then
    -- Stock: solo si el pedido quedo vinculado a un evento (se fija al
    -- crearlo, ver member_place_order) y el item tiene producto vinculado.
    -- Si no alcanza, se corta ACA con un error real -- antes se entregaba
    -- igual, en silencio, sin descontar nada.
    if v_order.kind = 'consumo' and v_order.event_id is not null then
      for v_item in select * from jsonb_array_elements(v_order.items) loop
        if v_item->>'product_id' is not null then
          select ep.id into v_ep_id from public.event_products ep
          where ep.event_id = v_order.event_id and ep.product_id = (v_item->>'product_id')::uuid limit 1;

          if v_ep_id is not null then
            v_needed := (v_item->>'qty')::integer * coalesce((v_item->>'stock_units')::integer, 1);

            select coalesce(sum(bs.quantity), 0) into v_available
            from public.bar_stock bs where bs.event_product_id = v_ep_id;
            if v_available < v_needed then
              raise exception 'No hay stock suficiente de "%" para entregar este pedido.', coalesce(v_item->>'name', 'este producto');
            end if;

            for v_bar in
              select bs.bar_id, bs.quantity from public.bar_stock bs
              where bs.event_product_id = v_ep_id and bs.quantity > 0
              order by bs.quantity desc
              for update
            loop
              exit when v_needed <= 0;
              v_take := least(v_bar.quantity, v_needed);
              update public.bar_stock set quantity = quantity - v_take, updated_at = now()
              where bar_id = v_bar.bar_id and event_product_id = v_ep_id;
              insert into public.stock_movements (event_id, event_product_id, bar_id, type, quantity, reason)
              values (v_order.event_id, v_ep_id, v_bar.bar_id, 'venta', v_take, 'Pedido de socio ' || v_order.pickup_code);
              v_needed := v_needed - v_take;
              v_deducted := true;
            end loop;
          end if;
        end if;
      end loop;
    end if;

    if v_order.points_earned > 0 then
      update public.premium_members set points_balance = points_balance + v_order.points_earned, updated_at = now() where id = v_order.member_id;
      insert into public.member_points_transactions (member_id, order_id, delta, reason)
      values (v_order.member_id, v_order.id, v_order.points_earned, 'Pedido ' || v_order.pickup_code);
    end if;

    -- Mesa pagada al llegar: se registra la venta recien al confirmarla.
    if v_order.kind = 'mesa' and v_order.sale_id is null and v_order.total_minor > 0 and v_order.event_id is not null then
      select first_name, last_name, dni, phone, email into v_first, v_last, v_dni, v_phone, v_email
      from public.premium_members where id = v_order.member_id;

      insert into public.buyers (organization_id, first_name, last_name, dni, phone, email)
      values (v_order.organization_id, v_first, v_last, nullif(btrim(coalesce(v_dni, '')), ''), coalesce(v_phone, ''), nullif(btrim(coalesce(v_email, '')), ''))
      returning id into v_buyer_id;

      insert into public.sales (organization_id, event_id, buyer_id, seller_member_id, status, total_minor, currency, channel, payment_method, table_id, confirmed_at)
      values (v_order.organization_id, v_order.event_id, v_buyer_id, null, 'confirmed', v_order.total_minor, 'ARS', 'mesa', null, v_order.table_id, now())
      returning id into v_sale_id;

      update public.member_orders set sale_id = v_sale_id where id = v_order.id;
    end if;

    update public.member_orders set status = 'delivered', delivered_at = now(), updated_at = now(), stock_deducted = v_deducted where id = v_order.id;

  elsif p_status = 'cancelled' then
    if v_order.payment = 'wallet' and v_order.total_minor > 0 then
      update public.premium_members set balance_minor = balance_minor + v_order.total_minor, updated_at = now() where id = v_order.member_id;
      insert into public.wallet_transactions (member_id, amount_minor, kind, note)
      values (v_order.member_id, v_order.total_minor, 'adjustment', 'Reembolso pedido ' || v_order.pickup_code);
    end if;
    if v_order.points_cost > 0 then
      update public.premium_members set points_balance = points_balance + v_order.points_cost, updated_at = now() where id = v_order.member_id;
      insert into public.member_points_transactions (member_id, order_id, delta, reason)
      values (v_order.member_id, v_order.id, v_order.points_cost, 'Reembolso pedido ' || v_order.pickup_code);
    end if;
    if v_order.table_id is not null then
      update public.bar_tables set status = 'available' where id = v_order.table_id and status = 'reserved';
    end if;
    if v_order.sale_id is not null then
      update public.sales set status = 'cancelled' where id = v_order.sale_id;
    end if;
    update public.member_orders set status = 'cancelled', updated_at = now() where id = v_order.id;

  else
    update public.member_orders set status = 'ready', updated_at = now() where id = v_order.id;
  end if;

  return query select p_status;
end;
$function$;

revoke all on function public.member_order_set_status(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.member_order_set_status(uuid, text, uuid, uuid) to service_role;

-- =============================================================
-- 3. cp_expire_stale_member_orders: pensada para cron. Cancela (con el
--    mismo reembolso/liberacion de mesa que una cancelacion normal) los
--    pedidos "pending" que quedaron colgados mas de p_hours horas -- nadie
--    los marco listos/entregados/cancelados. Reusa member_order_set_status
--    (mismo codigo probado) pasando la organizacion del pedido.
-- =============================================================

create or replace function public.cp_expire_stale_member_orders(p_hours integer default 6)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select id, organization_id from public.member_orders
    where status = 'pending' and created_at < now() - (greatest(p_hours, 1) || ' hours')::interval
    order by created_at asc
    limit 200
  loop
    begin
      perform public.member_order_set_status(v_row.id, 'cancelled', v_row.organization_id, null);
      v_count := v_count + 1;
    exception when others then
      -- Un pedido puntual que falle (carrera con el bartender marcandolo en
      -- paralelo, por ejemplo) no tiene que frenar la limpieza del resto.
      null;
    end;
  end loop;
  return v_count;
end;
$function$;

revoke all on function public.cp_expire_stale_member_orders(integer) from public, anon, authenticated;
grant execute on function public.cp_expire_stale_member_orders(integer) to service_role;

commit;

notify pgrst, 'reload schema';
