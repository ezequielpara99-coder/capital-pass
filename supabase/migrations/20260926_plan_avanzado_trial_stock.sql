-- Capital Pass: segundo plan de suscripcion ("Gestion avanzada", incluye
-- stock/barras siempre) y una prueba gratuita de 7 dias del modulo de
-- stock para cualquier organizacion que no este en ese plan.
begin;

insert into public.subscription_plans (code, name, description, price_minor, currency, billing_interval, active)
values (
  'gestion_avanzada',
  'Gestión avanzada',
  'Todo lo de Gestión básica, más control de stock, barras, bartenders y mesas sin límite de tiempo, y acceso a futuras actualizaciones de la plataforma.',
  190000,
  'ARS',
  'monthly',
  true
)
on conflict (code) do nothing;

-- Prueba de 7 dias del modulo de stock. Una fila por organizacion, se
-- carga una sola vez (ver cp_refresh_subscription) y no se reinicia si
-- la organizacion vuelve a pagar despues de vencida.
create table public.stock_trial (
  organization_id uuid primary key references public.organizations(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null
);
alter table public.stock_trial enable row level security;
revoke all on public.stock_trial from anon, authenticated;
grant all on public.stock_trial to service_role;

commit;

begin;

-- Mismo cuerpo que la version original (20260913_account_before_payment.sql)
-- mas el alta de la prueba de stock cuando la suscripcion activada no es
-- "gestion avanzada". Firma identica, por eso alcanza con reemplazarla.
create or replace function public.cp_refresh_subscription(p_signup_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.subscription_signups%rowtype;
  p public.subscription_payments%rowtype;
  plan public.subscription_plans%rowtype;
  internal_status text;
begin
  select * into s from public.subscription_signups where id = p_signup_id for update;
  if not found then raise exception 'Solicitud inexistente'; end if;
  select * into plan from public.subscription_plans where id = s.plan_id;
  select * into p from public.subscription_payments where signup_id = s.id and status = 'approved'
    order by period_end desc limit 1;
  internal_status := case
    when p.paid_at <= now() and p.period_end > now() then 'active'
    when s.mp_status = 'cancelled' then 'cancelled'
    when s.mp_status = 'paused' then 'paused'
    else 'payment_required' end;
  update public.organization_subscriptions set
    organization_id = s.organization_id, plan_id = s.plan_id,
    provider_subscription_id = s.mercadopago_preapproval_id,
    mercadopago_preapproval_id = s.mercadopago_preapproval_id,
    status = internal_status, current_period_start = p.paid_at, current_period_end = p.period_end,
    organization_name = s.organization_name, plan_name = plan.name,
    amount_minor = coalesce(s.expected_amount, plan.price_minor),
    currency = coalesce(s.expected_currency, plan.currency), payer_email = s.email, updated_at = now()
  where signup_id = s.id;
  if not found then
    insert into public.organization_subscriptions (
      signup_id, organization_id, plan_id, provider_subscription_id, mercadopago_preapproval_id,
      status, current_period_start, current_period_end, organization_name, plan_name,
      amount_minor, currency, payer_email
    ) values (
      s.id, s.organization_id, s.plan_id, s.mercadopago_preapproval_id, s.mercadopago_preapproval_id,
      internal_status, p.paid_at, p.period_end, s.organization_name, plan.name,
      coalesce(s.expected_amount, plan.price_minor), coalesce(s.expected_currency, plan.currency), s.email
    );
  end if;
  update public.subscription_signups set
    status = case when internal_status = 'active' then 'approved'
      when internal_status = 'cancelled' then 'cancelled' else 'payment_pending' end,
    approved_at = p.paid_at, provider_payment_id = p.payment_id, updated_at = now()
  where id = s.id;

  if internal_status = 'active' and coalesce(plan.code, '') <> 'gestion_avanzada' then
    insert into public.stock_trial (organization_id, starts_at, ends_at)
    values (s.organization_id, now(), now() + interval '7 days')
    on conflict (organization_id) do nothing;
  end if;
end;
$$;
revoke all on function public.cp_refresh_subscription(uuid) from public, anon, authenticated;
grant execute on function public.cp_refresh_subscription(uuid) to service_role;

-- Acceso al modulo de stock: plan "gestion avanzada" (siempre) o, para
-- cualquier otro plan, mientras dure la prueba gratuita de 7 dias.
create or replace function public.cp_org_has_stock_access(p_organization_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_plan_code text;
  v_trial_ends_at timestamptz;
begin
  if not public.cp_org_has_service(p_organization_id) then
    return false;
  end if;

  select sp.code into v_plan_code
  from public.organization_subscriptions os
  join public.subscription_plans sp on sp.id = os.plan_id
  where os.organization_id = p_organization_id
  order by os.updated_at desc
  limit 1;

  if v_plan_code = 'gestion_avanzada' then
    return true;
  end if;

  select ends_at into v_trial_ends_at from public.stock_trial where organization_id = p_organization_id;
  return v_trial_ends_at is not null and now() <= v_trial_ends_at;
end;
$$;
revoke all on function public.cp_org_has_stock_access(uuid) from public, anon;
grant execute on function public.cp_org_has_stock_access(uuid) to authenticated;

commit;

begin;

-- Las RPCs del modulo de stock pasan de exigir "alguna suscripcion activa"
-- a exigir puntualmente acceso al modulo de stock (avanzada o prueba
-- vigente). Mismas firmas que ya existian, solo cambia el cuerpo.

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

  if not public.cp_org_has_stock_access(v_organization_id) then
    raise exception 'La organizacion no tiene acceso al modulo de stock.';
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

  if not public.cp_org_has_stock_access(v_organization_id) then
    raise exception 'La organizacion no tiene acceso al modulo de stock.';
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

  if not public.cp_org_has_stock_access(v_organization_id) then
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

  if p_table_id is not null and not exists (
    select 1 from public.bar_tables t where t.id = p_table_id and t.event_id = v_event_id
  ) then
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
  select e.organization_id into v_organization_id from public.events e where e.id = p_event_id;
  if not found then
    raise exception 'El evento no existe';
  end if;

  if not public.is_platform_admin() and not public.cp_org_has_stock_access(v_organization_id) then
    raise exception 'La organizacion no tiene acceso al modulo de stock.';
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
