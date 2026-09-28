-- Pedidos de socios, completos:
--  * Al ENTREGAR un pedido se descuenta el stock de barra (si el item de la
--    carta esta vinculado a un producto de stock).
--  * Las reservas de mesa hechas desde la app generan una venta (channel
--    'mesa') para que aparezcan en los informes del evento.
--  * Niveles de socio (Bronce/Plata/Oro...) por puntos acumulados, con
--    descuento automatico en los pedidos.
--  * Puntos dobles (o x1.5, x3...) por fecha: "doble puntos este sabado".
-- Las funciones se recrean con la misma firma que ya existia.
begin;

-- =============================================================
-- 1. Tablas y columnas nuevas
-- =============================================================

create table if not exists public.member_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  min_points integer not null check (min_points >= 0),
  discount_percent integer not null default 0 check (discount_percent between 0 and 50),
  perk text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists member_levels_org_min_uq on public.member_levels (organization_id, min_points) where deleted_at is null;
alter table public.member_levels enable row level security;
revoke all on public.member_levels from anon, authenticated;
grant all on public.member_levels to service_role;

create table if not exists public.member_point_boosts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  multiplier numeric(4, 2) not null check (multiplier > 1 and multiplier <= 10),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists member_point_boosts_org_idx on public.member_point_boosts (organization_id, starts_at) where deleted_at is null;
alter table public.member_point_boosts enable row level security;
revoke all on public.member_point_boosts from anon, authenticated;
grant all on public.member_point_boosts to service_role;

-- Vinculo opcional de un item de la carta con un producto de stock.
alter table public.member_menu_items add column if not exists product_id uuid references public.products(id) on delete set null;
alter table public.member_menu_items add column if not exists stock_units integer not null default 1 check (stock_units > 0);

alter table public.member_orders add column if not exists discount_percent integer not null default 0;
alter table public.member_orders add column if not exists boost_multiplier numeric(4, 2) not null default 1;
alter table public.member_orders add column if not exists sale_id uuid;
alter table public.member_orders add column if not exists stock_deducted boolean not null default false;

-- =============================================================
-- 2. member_level_info: nivel actual y proximo de un socio
--    (por puntos GANADOS de por vida: canjear no baja de nivel).
-- =============================================================

create or replace function public.member_level_info(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid;
  v_life integer;
  v_level record;
  v_next record;
begin
  select organization_id into v_org from public.premium_members where id = p_member_id and deleted_at is null;
  if v_org is null then
    return null;
  end if;

  select coalesce(sum(delta), 0)::integer into v_life
  from public.member_points_transactions
  where member_id = p_member_id and delta > 0 and reason not like 'Reembolso%';

  select name, min_points, discount_percent, perk into v_level
  from public.member_levels
  where organization_id = v_org and deleted_at is null and min_points <= v_life
  order by min_points desc limit 1;

  select name, min_points into v_next
  from public.member_levels
  where organization_id = v_org and deleted_at is null and min_points > v_life
  order by min_points asc limit 1;

  return jsonb_build_object(
    'lifetime', v_life,
    'level', case when v_level.name is null then null
      else jsonb_build_object('name', v_level.name, 'min_points', v_level.min_points, 'discount_percent', v_level.discount_percent, 'perk', v_level.perk) end,
    'next', case when v_next.name is null then null
      else jsonb_build_object('name', v_next.name, 'min_points', v_next.min_points, 'missing', v_next.min_points - v_life) end
  );
end;
$function$;

revoke all on function public.member_level_info(uuid) from public, anon, authenticated;
grant execute on function public.member_level_info(uuid) to service_role;

-- =============================================================
-- 3. member_place_order: agrega descuento por nivel, puntos dobles,
--    snapshot del vinculo con stock y venta de mesa.
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
-- 4. member_order_set_status: al entregar descuenta stock y confirma la
--    venta de la mesa; al cancelar anula la venta de la mesa.
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
  v_event_id uuid;
  v_active_events integer;
  v_ep_id uuid;
  v_needed integer;
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
    if v_order.points_earned > 0 then
      update public.premium_members set points_balance = points_balance + v_order.points_earned, updated_at = now() where id = v_order.member_id;
      insert into public.member_points_transactions (member_id, order_id, delta, reason)
      values (v_order.member_id, v_order.id, v_order.points_earned, 'Pedido ' || v_order.pickup_code);
    end if;

    -- Stock: solo si hay UN evento activo (si hay varios o ninguno no se
    -- puede saber de cual barra salio) y el item esta vinculado a un producto.
    if v_order.kind = 'consumo' then
      select count(*), min(e.id::text)::uuid into v_active_events, v_event_id
      from public.events e where e.organization_id = v_order.organization_id and e.status = 'active';

      if v_active_events = 1 then
        for v_item in select * from jsonb_array_elements(v_order.items) loop
          if v_item->>'product_id' is not null then
            select ep.id into v_ep_id from public.event_products ep
            where ep.event_id = v_event_id and ep.product_id = (v_item->>'product_id')::uuid limit 1;

            if v_ep_id is not null then
              v_needed := (v_item->>'qty')::integer * coalesce((v_item->>'stock_units')::integer, 1);
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
                values (v_event_id, v_ep_id, v_bar.bar_id, 'venta', v_take, 'Pedido de socio ' || v_order.pickup_code);
                v_needed := v_needed - v_take;
                v_deducted := true;
              end loop;
            end if;
          end if;
        end loop;
      end if;
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

commit;

notify pgrst, 'reload schema';
