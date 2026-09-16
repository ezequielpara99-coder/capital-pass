-- Capital Pass: modulo de stock de barra, barras, bartenders y mesas.
-- Separado del resto (entradas/RRPP/puerta) pero reutiliza los mismos
-- patrones: bloqueo de fila para stock/cupo, efectivo/transferencia como
-- metodo de pago, alta de staff igual que RRPP/puerta/controlador.
-- Ejecutar una vez en Supabase SQL Editor antes de publicar el codigo.
begin;

-- =============================================================
-- 1. Roles nuevos
-- =============================================================

alter type public.organization_member_role add value if not exists 'bartender';
alter type public.event_staff_role add value if not exists 'bartender';

commit;

begin;

-- Un bartender queda asignado a UNA barra (donde vende). Nullable porque
-- el resto de los roles de event_staff no lo usan.
alter table public.event_staff add column if not exists bar_id uuid;

-- =============================================================
-- 2. Enums propios del modulo
-- =============================================================

create type public.product_category as enum ('bebida', 'insumo');
create type public.stock_movement_type as enum ('ingreso', 'asignacion_barra', 'venta', 'ajuste', 'perdida');

-- =============================================================
-- 3. Catalogo de productos (global, administrado por Capital Pass,
-- o propio de una organizacion)
-- =============================================================

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id), -- null = catalogo global
  name text not null,
  category public.product_category not null default 'bebida',
  brand text,
  image_path text, -- storage bucket product-assets
  servings_per_bottle integer, -- solo bebida: cuantos tragos rinde una botella
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.products enable row level security;
revoke all on public.products from anon, authenticated;
grant all on public.products to service_role;

-- =============================================================
-- 4. Instancia del producto para un evento (costo, precio, stock)
-- =============================================================

create table public.event_products (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  product_id uuid not null references public.products(id),
  cost_price_minor bigint not null default 0, -- costo de la botella
  sale_price_minor bigint not null default 0, -- precio del trago (override manual)
  profit_margin_percent numeric not null default 0,
  total_stock integer not null default 0, -- total comprado para el evento
  low_stock_threshold integer not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, product_id)
);
alter table public.event_products enable row level security;
revoke all on public.event_products from anon, authenticated;
grant all on public.event_products to service_role;

-- =============================================================
-- 5. Barras
-- =============================================================

create table public.bars (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.bars enable row level security;
revoke all on public.bars from anon, authenticated;
grant all on public.bars to service_role;

alter table public.event_staff add constraint event_staff_bar_id_fkey
  foreign key (bar_id) references public.bars(id);

-- Stock ACTUAL de un producto dentro de una barra (se mueve con
-- asignaciones, ventas y ajustes; el detalle de cada movimiento queda en
-- stock_movements como auditoria).
create table public.bar_stock (
  bar_id uuid not null references public.bars(id),
  event_product_id uuid not null references public.event_products(id),
  quantity integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bar_id, event_product_id)
);
alter table public.bar_stock enable row level security;
revoke all on public.bar_stock from anon, authenticated;
grant all on public.bar_stock to service_role;

-- =============================================================
-- 6. Mesas
-- =============================================================

create table public.bar_tables (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  name text not null,
  capacity integer,
  price_minor bigint, -- null = sin costo de reserva
  status text not null default 'available', -- available | reserved | occupied
  created_at timestamptz not null default now()
);
alter table public.bar_tables enable row level security;
revoke all on public.bar_tables from anon, authenticated;
grant all on public.bar_tables to service_role;

-- Vender/reservar una mesa reutiliza sales/buyers (mismo patron que una
-- entrada: comprador + metodo de pago), no una tabla paralela.
alter type public.sale_channel add value if not exists 'mesa';
alter table public.sales add column if not exists table_id uuid references public.bar_tables(id);

-- =============================================================
-- 7. Ventas de barra (lo que vende el bartender) y auditoria de stock
-- =============================================================

create table public.bar_sales (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  bar_id uuid not null references public.bars(id),
  bartender_member_id uuid not null references public.organization_members(id),
  table_id uuid not null references public.bar_tables(id),
  event_product_id uuid not null references public.event_products(id),
  quantity integer not null,
  unit_price_minor bigint not null,
  total_minor bigint not null,
  payment_method public.sale_payment_method not null,
  created_at timestamptz not null default now()
);
alter table public.bar_sales enable row level security;
revoke all on public.bar_sales from anon, authenticated;
grant all on public.bar_sales to service_role;

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  event_product_id uuid not null references public.event_products(id),
  bar_id uuid references public.bars(id), -- null = stock general del evento
  type public.stock_movement_type not null,
  quantity integer not null, -- siempre positivo; el signo lo da "type"
  reason text,
  actor_user_id uuid,
  created_at timestamptz not null default now()
);
alter table public.stock_movements enable row level security;
revoke all on public.stock_movements from anon, authenticated;
grant all on public.stock_movements to service_role;

commit;

begin;

-- =============================================================
-- 8. Asignar stock del pool general del evento a una barra
-- =============================================================

create or replace function public.assign_stock_to_bar(
  p_event_product_id uuid, p_bar_id uuid, p_quantity integer
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_organization_id uuid;
  v_total_stock integer;
  v_already_assigned integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  select ep.event_id, ep.total_stock, e.organization_id
  into v_event_id, v_total_stock, v_organization_id
  from public.event_products ep
  join public.events e on e.id = ep.event_id
  where ep.id = p_event_product_id
  for update of ep;

  if not found then
    raise exception 'El producto no existe para este evento';
  end if;

  if not public.cp_org_has_service(v_organization_id) then
    raise exception 'La organizacion necesita una suscripcion activa.';
  end if;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = v_organization_id and om.user_id = auth.uid()
      and om.role = 'organizer' and om.status = 'active'
  ) then
    raise exception 'No tenes permiso para administrar el stock de este evento';
  end if;

  if not exists (select 1 from public.bars b where b.id = p_bar_id and b.event_id = v_event_id) then
    raise exception 'La barra no existe para este evento';
  end if;

  select coalesce(sum(quantity), 0) into v_already_assigned
  from public.stock_movements
  where event_product_id = p_event_product_id and type = 'asignacion_barra';

  if v_already_assigned + p_quantity > v_total_stock then
    raise exception 'No hay suficiente stock general disponible. Disponible: %', greatest(v_total_stock - v_already_assigned, 0);
  end if;

  insert into public.bar_stock (bar_id, event_product_id, quantity)
  values (p_bar_id, p_event_product_id, p_quantity)
  on conflict (bar_id, event_product_id)
  do update set quantity = public.bar_stock.quantity + excluded.quantity, updated_at = now();

  insert into public.stock_movements (event_id, event_product_id, bar_id, type, quantity, actor_user_id)
  values (v_event_id, p_event_product_id, p_bar_id, 'asignacion_barra', p_quantity, auth.uid());
end;
$$;
revoke all on function public.assign_stock_to_bar(uuid, uuid, integer) from public, anon;
grant execute on function public.assign_stock_to_bar(uuid, uuid, integer) to authenticated;

-- =============================================================
-- 9. Ajuste manual de stock de una barra (correccion o perdida)
-- =============================================================

create or replace function public.adjust_bar_stock(
  p_bar_id uuid, p_event_product_id uuid, p_quantity_delta integer, p_type text, p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_organization_id uuid;
  v_current integer;
  v_movement_type public.stock_movement_type;
begin
  if p_type not in ('ajuste', 'perdida') then
    raise exception 'Tipo de movimiento invalido';
  end if;
  v_movement_type := p_type::public.stock_movement_type;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Indica el motivo del ajuste';
  end if;

  if p_quantity_delta = 0 then
    raise exception 'La cantidad no puede ser cero';
  end if;

  select b.event_id, e.organization_id into v_event_id, v_organization_id
  from public.bars b join public.events e on e.id = b.event_id
  where b.id = p_bar_id;

  if not found then
    raise exception 'La barra no existe';
  end if;

  if not public.cp_org_has_service(v_organization_id) then
    raise exception 'La organizacion necesita una suscripcion activa.';
  end if;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = v_organization_id and om.user_id = auth.uid()
      and om.role = 'organizer' and om.status = 'active'
  ) then
    raise exception 'No tenes permiso para administrar el stock de este evento';
  end if;

  select quantity into v_current from public.bar_stock
  where bar_id = p_bar_id and event_product_id = p_event_product_id
  for update;

  if not found then
    v_current := 0;
    insert into public.bar_stock (bar_id, event_product_id, quantity) values (p_bar_id, p_event_product_id, 0);
  end if;

  if v_current + p_quantity_delta < 0 then
    raise exception 'El ajuste dejaria el stock en negativo. Stock actual: %', v_current;
  end if;

  update public.bar_stock set quantity = v_current + p_quantity_delta, updated_at = now()
  where bar_id = p_bar_id and event_product_id = p_event_product_id;

  insert into public.stock_movements (event_id, event_product_id, bar_id, type, quantity, reason, actor_user_id)
  values (v_event_id, p_event_product_id, p_bar_id, v_movement_type, abs(p_quantity_delta), p_reason, auth.uid());
end;
$$;
revoke all on function public.adjust_bar_stock(uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.adjust_bar_stock(uuid, uuid, integer, text, text) to authenticated;

-- =============================================================
-- 10. Venta de un trago en la barra (la hace el bartender)
-- =============================================================

create or replace function public.create_bartender_sale(
  p_bar_id uuid, p_table_id uuid, p_event_product_id uuid, p_quantity integer, p_payment_method text
)
returns table(bar_sale_id uuid, total_minor bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_organization_id uuid;
  v_bartender_member_id uuid;
  v_current_stock integer;
  v_sale_price bigint;
  v_total bigint;
  v_payment_method public.sale_payment_method;
  v_sale_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity > 50 then
    raise exception 'Cantidad invalida';
  end if;

  begin
    v_payment_method := p_payment_method::public.sale_payment_method;
  exception when invalid_text_representation then
    raise exception 'Indica si la venta fue en efectivo o transferencia';
  end;

  select b.event_id, e.organization_id into v_event_id, v_organization_id
  from public.bars b join public.events e on e.id = b.event_id
  where b.id = p_bar_id;

  if not found then
    raise exception 'La barra no existe';
  end if;

  if not public.cp_org_has_service(v_organization_id) then
    raise exception 'La organizacion necesita una suscripcion activa.';
  end if;

  -- El bartender solo puede vender desde SU barra asignada.
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

  if not exists (select 1 from public.bar_tables t where t.id = p_table_id and t.event_id = v_event_id) then
    raise exception 'La mesa no existe para este evento';
  end if;

  select ep.sale_price_minor into v_sale_price
  from public.event_products ep where ep.id = p_event_product_id and ep.event_id = v_event_id;

  if not found then
    raise exception 'El producto no existe para este evento';
  end if;

  select quantity into v_current_stock from public.bar_stock
  where bar_id = p_bar_id and event_product_id = p_event_product_id
  for update;

  if not found or v_current_stock < p_quantity then
    raise exception 'No hay suficiente stock en esta barra. Disponible: %', coalesce(v_current_stock, 0);
  end if;

  update public.bar_stock set quantity = quantity - p_quantity, updated_at = now()
  where bar_id = p_bar_id and event_product_id = p_event_product_id;

  v_total := v_sale_price * p_quantity;

  insert into public.bar_sales (event_id, bar_id, bartender_member_id, table_id, event_product_id, quantity, unit_price_minor, total_minor, payment_method)
  values (v_event_id, p_bar_id, v_bartender_member_id, p_table_id, p_event_product_id, p_quantity, v_sale_price, v_total, v_payment_method)
  returning id into v_sale_id;

  insert into public.stock_movements (event_id, event_product_id, bar_id, type, quantity, actor_user_id)
  values (v_event_id, p_event_product_id, p_bar_id, 'venta', p_quantity, auth.uid());

  return query select v_sale_id, v_total;
end;
$$;
revoke all on function public.create_bartender_sale(uuid, uuid, uuid, integer, text) from public, anon;
grant execute on function public.create_bartender_sale(uuid, uuid, uuid, integer, text) to authenticated;

-- =============================================================
-- 11. Vender/reservar una mesa (organizador o RRPP)
-- =============================================================

create or replace function public.sell_table(
  p_event_id uuid, p_table_id uuid,
  p_buyer_first_name text, p_buyer_last_name text, p_buyer_dni text, p_buyer_phone text,
  p_payment_method text
)
returns table(sale_id uuid, total_minor bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_organization_id uuid;
  v_seller_member_id uuid;
  v_seller_role public.organization_member_role;
  v_price bigint;
  v_status text;
  v_buyer_id uuid;
  v_sale_id uuid;
  v_payment_method public.sale_payment_method;
begin
  if not public.is_platform_admin() and not exists (
    select 1 from public.events e where e.id = p_event_id and public.cp_org_has_service(e.organization_id)
  ) then
    raise exception 'La organizacion necesita una suscripcion activa.';
  end if;

  begin
    v_payment_method := p_payment_method::public.sale_payment_method;
  exception when invalid_text_representation then
    raise exception 'Indica si la venta fue en efectivo o transferencia';
  end;

  if p_buyer_first_name is null or btrim(p_buyer_first_name) = '' then
    raise exception 'El nombre del comprador es obligatorio';
  end if;
  if p_buyer_last_name is null or btrim(p_buyer_last_name) = '' then
    raise exception 'El apellido del comprador es obligatorio';
  end if;
  if p_buyer_phone is null or btrim(p_buyer_phone) = '' then
    raise exception 'El WhatsApp del comprador es obligatorio';
  end if;

  select e.organization_id into v_organization_id from public.events e where e.id = p_event_id;
  if not found then
    raise exception 'El evento no existe';
  end if;

  select om.id, om.role into v_seller_member_id, v_seller_role
  from public.organization_members om
  where om.organization_id = v_organization_id and om.user_id = auth.uid() and om.status = 'active'
  limit 1;

  if v_seller_member_id is null or v_seller_role not in ('organizer', 'rrpp') then
    raise exception 'No tenes permiso para vender mesas en este evento';
  end if;

  if v_seller_role = 'rrpp' and not exists (
    select 1 from public.event_staff es
    where es.event_id = p_event_id and es.organization_member_id = v_seller_member_id
      and es.staff_role = 'rrpp' and es.active = true
  ) then
    raise exception 'No estas asignado como RRPP a este evento';
  end if;

  select price_minor, status into v_price, v_status
  from public.bar_tables where id = p_table_id and event_id = p_event_id
  for update;

  if not found then
    raise exception 'La mesa no existe para este evento';
  end if;

  if v_status <> 'available' then
    raise exception 'Esa mesa ya no esta disponible';
  end if;

  insert into public.buyers (organization_id, first_name, last_name, dni, phone)
  values (v_organization_id, btrim(p_buyer_first_name), btrim(p_buyer_last_name), nullif(btrim(coalesce(p_buyer_dni, '')), ''), btrim(p_buyer_phone))
  returning id into v_buyer_id;

  insert into public.sales (organization_id, event_id, buyer_id, seller_member_id, status, total_minor, currency, channel, payment_method, table_id, confirmed_at)
  values (v_organization_id, p_event_id, v_buyer_id, v_seller_member_id, 'confirmed', coalesce(v_price, 0), 'ARS', 'mesa', v_payment_method, p_table_id, now())
  returning id into v_sale_id;

  update public.bar_tables set status = 'reserved' where id = p_table_id;

  return query select v_sale_id, coalesce(v_price, 0);
end;
$$;
revoke all on function public.sell_table(uuid, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.sell_table(uuid, uuid, text, text, text, text, text) to authenticated;

commit;

begin;

-- Evita duplicar el catalogo global si esta migracion se corre mas de
-- una vez (ON CONFLICT DO NOTHING necesita un indice unico real).
create unique index if not exists products_global_name_idx
  on public.products (name) where organization_id is null;

-- =============================================================
-- 12. Catalogo global precargado (organization_id = null), sin logo --
-- las fotos/logos reales se suben despues desde el admin. Nombres
-- tipicos de una barra argentina. servings_per_bottle es un default
-- editable por evento, no una verdad absoluta.
-- =============================================================

insert into public.products (name, category, brand, servings_per_bottle) values
  ('Fernet Branca 750ml', 'bebida', 'Branca', 15),
  ('Fernet 1882 750ml', 'bebida', '1882', 15),
  ('Cynar 700ml', 'bebida', 'Cynar', 14),
  ('Gancia 950ml', 'bebida', 'Gancia', 19),
  ('Campari 750ml', 'bebida', 'Campari', 15),
  ('Aperol 750ml', 'bebida', 'Aperol', 15),
  ('Vodka Smirnoff 750ml', 'bebida', 'Smirnoff', 15),
  ('Vodka Absolut 750ml', 'bebida', 'Absolut', 15),
  ('Gin Beefeater 750ml', 'bebida', 'Beefeater', 15),
  ('Gin Bombay Sapphire 750ml', 'bebida', 'Bombay Sapphire', 15),
  ('Gin Principe de los Apostoles 700ml', 'bebida', 'Principe de los Apostoles', 14),
  ('Whisky Johnnie Walker Red Label 750ml', 'bebida', 'Johnnie Walker', 15),
  ('Whisky Johnnie Walker Black Label 750ml', 'bebida', 'Johnnie Walker', 15),
  ('Whisky Ballantines 750ml', 'bebida', 'Ballantines', 15),
  ('Ron Bacardi Blanco 750ml', 'bebida', 'Bacardi', 15),
  ('Ron Havana Club 750ml', 'bebida', 'Havana Club', 15),
  ('Tequila Jose Cuervo 750ml', 'bebida', 'Jose Cuervo', 15),
  ('Licor Jagermeister 700ml', 'bebida', 'Jagermeister', 14),
  ('Licor Baileys 750ml', 'bebida', 'Baileys', 15),
  ('Cerveza Quilmes 1L', 'bebida', 'Quilmes', 3),
  ('Cerveza Stella Artois 1L', 'bebida', 'Stella Artois', 3),
  ('Cerveza Corona 355ml', 'bebida', 'Corona', 1),
  ('Cerveza Heineken 1L', 'bebida', 'Heineken', 3),
  ('Cerveza Patagonia 1L', 'bebida', 'Patagonia', 3),
  ('Energizante Red Bull 250ml', 'bebida', 'Red Bull', 1),
  ('Energizante Speed 269ml', 'bebida', 'Speed', 1),
  ('Coca-Cola 1.5L', 'bebida', 'Coca-Cola', 12),
  ('Coca-Cola Zero 1.5L', 'bebida', 'Coca-Cola', 12),
  ('Sprite 1.5L', 'bebida', 'Sprite', 12),
  ('Fanta Naranja 1.5L', 'bebida', 'Fanta', 12),
  ('Pomelo Paso de los Toros 1.5L', 'bebida', 'Paso de los Toros', 12),
  ('Agua Tonica Schweppes 1.5L', 'bebida', 'Schweppes', 12),
  ('Soda 1.5L', 'bebida', 'Soda', 12),
  ('Agua Mineral 500ml', 'bebida', 'Agua', 1),
  ('Espumante Chandon 750ml', 'bebida', 'Chandon', 6),
  ('Vino Tinto 750ml', 'bebida', 'Vino', 6),
  ('Vino Blanco 750ml', 'bebida', 'Vino', 6),
  ('Hielo bolsa 5kg', 'insumo', null, null),
  ('Vasos descartables x50', 'insumo', null, null),
  ('Sorbetes x100', 'insumo', null, null),
  ('Servilletas paquete', 'insumo', null, null)
on conflict (name) where organization_id is null do nothing;

commit;

