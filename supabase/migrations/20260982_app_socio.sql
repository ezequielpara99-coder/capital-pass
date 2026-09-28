-- App del socio premium: cada boliche tiene su "carta" (tragos, combos y
-- premios canjeables por puntos), el socio hace pedidos y reserva mesas
-- desde su celular, y suma puntos por lo que consume. Tambien agrega el
-- registro de compras del organizador (insumos / proveedores).
--
-- Todo el movimiento de plata y puntos pasa por funciones que bloquean la
-- fila del socio (mismo patron que wallet_move): el saldo y los puntos
-- nunca se desincronizan de sus ledgers. Las funciones son solo para
-- service_role: el socio entra con el link firmado de su carnet (no tiene
-- sesion de Supabase) y el panel del organizador pasa por su API.
begin;

-- =============================================================
-- 1. Puntos del socio
-- =============================================================

alter table public.premium_members add column if not exists points_balance integer not null default 0;

create table if not exists public.member_points_transactions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.premium_members(id) on delete cascade,
  order_id uuid,
  delta integer not null check (delta <> 0),
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists member_points_transactions_member_idx on public.member_points_transactions (member_id, created_at desc);

alter table public.member_points_transactions enable row level security;
revoke all on public.member_points_transactions from anon, authenticated;
grant all on public.member_points_transactions to service_role;

-- Puntos que el organizador da por asistir a cada fiesta (0 = no da).
alter table public.organizations add column if not exists member_checkin_points integer not null default 0 check (member_checkin_points >= 0);

-- Asistencias: una por socio y por fiesta (la puerta escanea el carnet).
create table if not exists public.member_checkins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.premium_members(id) on delete cascade,
  event_id uuid not null,
  points integer not null default 0,
  created_at timestamptz not null default now(),
  unique (member_id, event_id)
);
create index if not exists member_checkins_org_idx on public.member_checkins (organization_id, created_at desc);

alter table public.member_checkins enable row level security;
revoke all on public.member_checkins from anon, authenticated;
grant all on public.member_checkins to service_role;

-- =============================================================
-- 2. Carta del boliche
-- =============================================================

create table if not exists public.member_menu_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('trago', 'combo', 'premio')),
  name text not null,
  description text,
  price_minor bigint not null default 0 check (price_minor >= 0),
  points_earned integer not null default 0 check (points_earned >= 0),
  points_cost integer check (points_cost > 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  -- Un premio se paga con puntos; tragos y combos con plata y dan puntos.
  constraint member_menu_items_pricing_check check (
    (kind = 'premio' and points_cost is not null and price_minor = 0 and points_earned = 0)
    or (kind <> 'premio' and points_cost is null)
  )
);
create index if not exists member_menu_items_org_idx on public.member_menu_items (organization_id, kind, sort_order) where deleted_at is null;

alter table public.member_menu_items enable row level security;
revoke all on public.member_menu_items from anon, authenticated;
grant all on public.member_menu_items to service_role;

-- =============================================================
-- 3. Pedidos del socio (consumo o reserva de mesa)
-- =============================================================

create table if not exists public.member_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.premium_members(id) on delete cascade,
  event_id uuid,
  table_id uuid,
  kind text not null check (kind in ('consumo', 'mesa')),
  items jsonb not null default '[]'::jsonb,
  total_minor bigint not null default 0 check (total_minor >= 0),
  points_cost integer not null default 0 check (points_cost >= 0),
  points_earned integer not null default 0 check (points_earned >= 0),
  payment text not null check (payment in ('wallet', 'en_barra')),
  delivery text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'delivered', 'cancelled')),
  pickup_code text not null,
  note text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists member_orders_org_status_idx on public.member_orders (organization_id, status, created_at desc);
create index if not exists member_orders_member_idx on public.member_orders (member_id, created_at desc);
create unique index if not exists member_orders_member_key_uq on public.member_orders (member_id, idempotency_key) where idempotency_key is not null;

alter table public.member_orders enable row level security;
revoke all on public.member_orders from anon, authenticated;
grant all on public.member_orders to service_role;

-- =============================================================
-- 4. Compras del organizador (insumos, proveedores)
-- =============================================================

create table if not exists public.organization_purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid,
  supplier text,
  description text not null,
  total_minor bigint not null check (total_minor > 0),
  purchased_on date not null default current_date,
  payment_method text,
  notes text,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists organization_purchases_org_idx on public.organization_purchases (organization_id, purchased_on desc) where deleted_at is null;

alter table public.organization_purchases enable row level security;
revoke all on public.organization_purchases from anon, authenticated;
grant all on public.organization_purchases to service_role;

-- =============================================================
-- 5. member_place_order: el socio hace un pedido
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
begin
  if p_kind not in ('consumo', 'mesa') then
    raise exception 'Tipo de pedido invalido.';
  end if;
  if p_payment not in ('wallet', 'en_barra') then
    raise exception 'Metodo de pago invalido.';
  end if;

  select organization_id, status, expires_at, premium_members.balance_minor, premium_members.points_balance
  into v_org_id, v_status, v_expires, v_balance, v_points
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
        'price_minor', v_menu.price_minor, 'points_cost', v_menu.points_cost
      );
    end loop;
  else
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

  insert into public.member_orders (organization_id, member_id, event_id, table_id, kind, items, total_minor, points_cost, points_earned, payment, delivery, pickup_code, note, idempotency_key)
  values (v_org_id, p_member_id, v_event_id, p_table_id, p_kind, v_items, v_total, v_points_cost, v_points_earned, p_payment,
    nullif(left(btrim(coalesce(p_delivery, '')), 80), ''), v_code,
    nullif(left(btrim(coalesce(p_note, '')), 300), ''), nullif(btrim(coalesce(p_key, '')), ''))
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
-- 6. member_order_set_status: el organizador (o el propio socio, solo
--    para cancelar un pedido pendiente) cambia el estado de un pedido.
--    Al entregar suma los puntos; al cancelar devuelve saldo, puntos y
--    libera la mesa.
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
    update public.member_orders set status = 'delivered', delivered_at = now(), updated_at = now() where id = v_order.id;

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
-- 7. member_checkin_award: la puerta escanea el carnet y el socio suma
--    los puntos de asistencia de esa fiesta (una sola vez por evento).
--    Devuelve los puntos otorgados (0 si ya habia venido, no da puntos
--    o el socio no esta activo).
-- =============================================================

create or replace function public.member_checkin_award(p_member_id uuid, p_event_id uuid)
returns table(points_awarded integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org_id uuid;
  v_status text;
  v_expires date;
  v_event_org uuid;
  v_points integer;
  v_inserted integer;
begin
  select organization_id, status, expires_at into v_org_id, v_status, v_expires
  from public.premium_members where id = p_member_id and deleted_at is null for update;
  if v_org_id is null then
    return query select 0;
    return;
  end if;

  select e.organization_id into v_event_org from public.events e where e.id = p_event_id;
  if v_event_org is null or v_event_org <> v_org_id then
    return query select 0;
    return;
  end if;

  select member_checkin_points into v_points from public.organizations where id = v_org_id;
  v_points := coalesce(v_points, 0);

  -- Asistio activo: se registra siempre; los puntos solo si la membresia esta vigente.
  if v_status <> 'active' or (v_expires is not null and v_expires < current_date) then
    v_points := 0;
  end if;

  insert into public.member_checkins (organization_id, member_id, event_id, points)
  values (v_org_id, p_member_id, p_event_id, v_points)
  on conflict (member_id, event_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 or v_points = 0 then
    return query select 0;
    return;
  end if;

  update public.premium_members set points_balance = points_balance + v_points, updated_at = now() where id = p_member_id;
  insert into public.member_points_transactions (member_id, delta, reason)
  values (p_member_id, v_points, 'Asistencia a la fiesta');

  return query select v_points;
end;
$function$;

revoke all on function public.member_checkin_award(uuid, uuid) from public, anon, authenticated;
grant execute on function public.member_checkin_award(uuid, uuid) to service_role;

-- =============================================================
-- 8. member_metrics: el panel del organizador (quienes compran, quien
--    tiene mas puntos, cliente destacado, productos estrella, asistencia).
--    Se calcula en SQL para no toparse con el limite de 1000 filas.
-- =============================================================

create or replace function public.member_metrics(p_organization_id uuid, p_since timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'members', (
      select jsonb_build_object(
        'total', count(*)::int,
        'active', count(*) filter (where status = 'active' and (expires_at is null or expires_at >= current_date))::int,
        'wallet_total_minor', coalesce(sum(balance_minor), 0),
        'points_total', coalesce(sum(points_balance), 0)::int
      )
      from public.premium_members where organization_id = p_organization_id and deleted_at is null
    ),
    'period', (
      select jsonb_build_object(
        'orders', count(*)::int,
        'delivered', count(*) filter (where status = 'delivered')::int,
        'cancelled', count(*) filter (where status = 'cancelled')::int,
        'revenue_minor', coalesce(sum(total_minor) filter (where status = 'delivered'), 0),
        'points_given', coalesce(sum(points_earned) filter (where status = 'delivered'), 0)::int,
        'buyers', count(distinct member_id) filter (where status = 'delivered')::int
      )
      from public.member_orders where organization_id = p_organization_id and created_at >= p_since
    ),
    'top_spenders', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select m.id, m.first_name || ' ' || m.last_name as name, m.member_code as code,
          sum(o.total_minor) as spent_minor, count(*)::int as orders
        from public.member_orders o
        join public.premium_members m on m.id = o.member_id
        where o.organization_id = p_organization_id and o.status = 'delivered' and o.created_at >= p_since and m.deleted_at is null
        group by m.id
        order by sum(o.total_minor) desc, count(*) desc
        limit 10
      ) t
    ),
    'top_points', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select id, first_name || ' ' || last_name as name, member_code as code, points_balance
        from public.premium_members
        where organization_id = p_organization_id and deleted_at is null and points_balance > 0
        order by points_balance desc
        limit 10
      ) t
    ),
    'top_products', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select item->>'name' as name,
          sum((item->>'qty')::int)::int as qty,
          sum((item->>'qty')::int * (item->>'price_minor')::bigint) as revenue_minor
        from public.member_orders o, jsonb_array_elements(o.items) item
        where o.organization_id = p_organization_id and o.status = 'delivered' and o.created_at >= p_since
          and item->>'kind' in ('trago', 'combo')
        group by item->>'name'
        order by sum((item->>'qty')::int) desc
        limit 10
      ) t
    ),
    'attendance', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select e.id, e.name, count(*)::int as members
        from public.member_checkins c
        join public.events e on e.id = c.event_id
        where c.organization_id = p_organization_id and c.created_at >= p_since
        group by e.id, e.name
        order by max(c.created_at) desc
        limit 8
      ) t
    ),
    'top_attendees', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select m.id, m.first_name || ' ' || m.last_name as name, m.member_code as code, count(*)::int as visits
        from public.member_checkins c
        join public.premium_members m on m.id = c.member_id
        where c.organization_id = p_organization_id and c.created_at >= p_since and m.deleted_at is null
        group by m.id
        order by count(*) desc
        limit 10
      ) t
    )
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.member_metrics(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.member_metrics(uuid, timestamptz) to service_role;

commit;

notify pgrst, 'reload schema';
