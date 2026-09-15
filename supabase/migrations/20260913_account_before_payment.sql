-- Capital Pass: cuenta primero, servicio habilitado por cobros verificados.
-- Ejecutar una vez en Supabase SQL Editor antes de publicar el codigo.
begin;

alter table public.subscription_signups
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists checkout_url text,
  add column if not exists expected_amount numeric,
  add column if not exists expected_currency text,
  add column if not exists frequency_months integer,
  add column if not exists mp_status text,
  add column if not exists checkout_started_at timestamptz;

create index if not exists cp_signups_user_idx on public.subscription_signups(user_id);
create unique index if not exists cp_signups_preapproval_idx
  on public.subscription_signups(mercadopago_preapproval_id)
  where mercadopago_preapproval_id is not null;

create table if not exists public.subscription_payments (
  payment_id text primary key,
  signup_id uuid not null references public.subscription_signups(id),
  status text not null,
  amount numeric not null,
  currency text not null,
  paid_at timestamptz,
  period_end timestamptz,
  provider_updated_at timestamptz not null,
  receipt_sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.subscription_payments enable row level security;
revoke all on public.subscription_payments from anon, authenticated;
grant all on public.subscription_payments to service_role;

-- La fecha viene del cobro, nunca de la llegada de un webhook.
create or replace function public.cp_org_has_service(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organizations o where o.id = p_organization_id and o.active
    and (
      exists (
        select 1 from public.platform_admins a
        where a.user_id = auth.uid()
      )
      or exists (
        select 1 from public.subscription_payments p
        join public.subscription_signups s on s.id = p.signup_id
        where s.organization_id = o.id and p.status = 'approved'
          and p.paid_at <= now() and p.period_end > now()
      )
    )
  );
$$;
revoke all on function public.cp_org_has_service(uuid) from public;
grant execute on function public.cp_org_has_service(uuid) to authenticated, service_role;

create or replace function public.cp_ensure_account(p_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  u auth.users%rowtype;
  org_id uuid;
  meta jsonb;
  first_name_value text;
  last_name_value text;
  org_name text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into u from auth.users where id = p_user_id;
  if not found or u.email_confirmed_at is null then
    raise exception 'Confirmá tu email antes de activar el servicio.';
  end if;
  meta := coalesce(u.raw_user_meta_data, '{}'::jsonb);
  first_name_value := coalesce(nullif(btrim(meta->>'first_name'), ''), 'Organizador');
  last_name_value := coalesce(btrim(meta->>'last_name'), '');
  org_name := coalesce(nullif(btrim(meta->>'organization_name'), ''), 'Mi organización');

  select m.organization_id into org_id from public.organization_members m
    where m.user_id = p_user_id and m.role = 'organizer' and m.status = 'active'
    order by m.created_at, m.id limit 1;
  if org_id is null then
    if exists (select 1 from public.organization_members where user_id = p_user_id) then
      raise exception 'Tu cuenta ya tiene un rol asignado. Contactá al administrador.';
    end if;
    org_id := gen_random_uuid();
    insert into public.organizations(id, name, slug, contact_email)
      values (org_id, org_name, 'org-' || org_id::text, u.email);
    insert into public.organization_members(organization_id, user_id, role, status)
      values (org_id, p_user_id, 'organizer', 'active');
  end if;

  insert into public.profiles(id, first_name, last_name)
    values (p_user_id, first_name_value, last_name_value) on conflict (id) do nothing;

  -- Recupera solicitudes anteriores solo con el email confirmado del titular.
  -- El email de quien paga en Mercado Pago puede ser diferente.
  update public.subscription_signups s set
    user_id = p_user_id, organization_id = org_id, account_created_at = now(),
    expected_amount = coalesce(s.expected_amount, p.price_minor),
    expected_currency = coalesce(s.expected_currency, p.currency),
    frequency_months = coalesce(s.frequency_months, case p.billing_interval when 'yearly' then 12 else 1 end)
  from public.subscription_plans p
  where s.plan_id = p.id and s.user_id is null
    and s.organization_id is null and lower(btrim(s.email)) = lower(btrim(u.email));
  return org_id;
end;
$$;
revoke all on function public.cp_ensure_account(uuid) from public, anon, authenticated;
grant execute on function public.cp_ensure_account(uuid) to service_role;

create or replace function public.cp_prepare_checkout(p_user_id uuid, p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  org_id uuid;
  s public.subscription_signups%rowtype;
  p public.subscription_plans%rowtype;
  u auth.users%rowtype;
  profile public.profiles%rowtype;
  org public.organizations%rowtype;
begin
  org_id := public.cp_ensure_account(p_user_id);
  if public.cp_org_has_service(org_id) then
    raise exception 'El servicio ya está activo. No hace falta otro pago.';
  end if;
  select * into s from public.subscription_signups
    where user_id = p_user_id and organization_id = org_id
      and status not in ('cancelled', 'rejected', 'expired')
      and coalesce(mp_status, '') <> 'cancelled'
    order by created_at desc limit 1 for update;
  if found then
    return to_jsonb(s);
  end if;
  select * into p from public.subscription_plans where id = p_plan_id and active;
  if not found or p.price_minor <= 0 then raise exception 'El plan no está disponible.'; end if;
  select * into u from auth.users where id = p_user_id;
  select * into profile from public.profiles where id = p_user_id;
  select * into org from public.organizations where id = org_id;
  insert into public.subscription_signups (
    user_id, organization_id, plan_id, first_name, last_name, organization_name,
    email, status, expected_amount, expected_currency, frequency_months, account_created_at
  ) values (
    p_user_id, org_id, p.id, profile.first_name, profile.last_name, org.name,
    u.email, 'payment_pending', p.price_minor, p.currency,
    case p.billing_interval when 'yearly' then 12 else 1 end, now()
  ) returning * into s;
  return to_jsonb(s);
end;
$$;
revoke all on function public.cp_prepare_checkout(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cp_prepare_checkout(uuid, uuid) to service_role;

create or replace function public.cp_lock_checkout(p_signup_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.subscription_signups set checkout_started_at = now()
  where id = p_signup_id and mercadopago_preapproval_id is null
    and (checkout_started_at is null or checkout_started_at < now() - interval '2 minutes');
  return found;
end;
$$;
revoke all on function public.cp_lock_checkout(uuid) from public, anon, authenticated;
grant execute on function public.cp_lock_checkout(uuid) to service_role;

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
end;
$$;
revoke all on function public.cp_refresh_subscription(uuid) from public, anon, authenticated;
grant execute on function public.cp_refresh_subscription(uuid) to service_role;

create or replace function public.cp_record_payment(
  p_signup_id uuid, p_payment_id text, p_status text, p_amount numeric, p_currency text,
  p_paid_at timestamptz, p_updated_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare s public.subscription_signups%rowtype;
begin
  select * into s from public.subscription_signups where id = p_signup_id for update;
  if not found then raise exception 'Solicitud inexistente'; end if;
  if s.expected_amount is null or s.frequency_months not in (1, 12)
    or p_amount <> s.expected_amount or p_currency <> s.expected_currency then
    raise exception 'El cobro no coincide con el plan contratado.';
  end if;
  if p_status = 'approved' and (p_paid_at is null or p_paid_at > now() + interval '5 minutes') then
    raise exception 'Fecha de cobro inválida.';
  end if;
  if exists (select 1 from public.subscription_payments
    where payment_id = p_payment_id and signup_id <> p_signup_id) then
    raise exception 'El cobro ya pertenece a otra solicitud.';
  end if;
  insert into public.subscription_payments (
    payment_id, signup_id, status, amount, currency, paid_at, period_end, provider_updated_at
  ) values (
    p_payment_id, p_signup_id, p_status, p_amount, p_currency, p_paid_at,
    p_paid_at + make_interval(months => s.frequency_months), p_updated_at
  ) on conflict (payment_id) do update set
    status = excluded.status,
    paid_at = excluded.paid_at, period_end = excluded.period_end,
    provider_updated_at = excluded.provider_updated_at
  where excluded.provider_updated_at >= subscription_payments.provider_updated_at;
  perform public.cp_refresh_subscription(p_signup_id);
end;
$$;
revoke all on function public.cp_record_payment(uuid, text, text, numeric, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.cp_record_payment(uuid, text, text, numeric, text, timestamptz, timestamptz)
  to service_role;

-- Protege tambien los endpoints que consultan membresias antes de usar el cliente admin.
drop policy if exists cp_members_subscription_gate on public.organization_members;
create policy cp_members_subscription_gate on public.organization_members
  as restrictive for select to authenticated
  using (public.is_platform_admin() or public.cp_org_has_service(organization_id));

-- No acepta como prueba de cobro los estados del webhook anterior.
-- Los registros anteriores se conservan y se reconcilian contra Mercado Pago.
CREATE OR REPLACE FUNCTION public.can_view_member_profile(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organization_members me
    join public.organization_members target
      on target.organization_id = me.organization_id
    where public.cp_org_has_service(me.organization_id)
      and me.user_id = auth.uid()
      and me.status = 'active'
      and me.role = 'organizer'
      and target.user_id = p_user_id
      and target.status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_active_org_member(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organization_members
    where public.cp_org_has_service(organization_id)
      and organization_id = p_organization_id
      and user_id = auth.uid()
      and status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_assigned_to_event(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.event_staff es
    join public.organization_members om
      on om.id = es.organization_member_id
    where public.cp_org_has_service(om.organization_id)
      and es.event_id = p_event_id
      and es.active = true
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_event_organizer(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.events e
    join public.organization_members om
      on om.organization_id = e.organization_id
    where public.cp_org_has_service(om.organization_id)
      and e.id = p_event_id
      and om.user_id = auth.uid()
      and om.role = 'organizer'
      and om.status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_org_organizer(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organization_members
    where public.cp_org_has_service(organization_id)
      and organization_id = p_organization_id
      and user_id = auth.uid()
      and status = 'active'
      and role = 'organizer'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_own_membership(p_member_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organization_members om
    where public.cp_org_has_service(om.organization_id)
      and om.id = p_member_id
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_sale_seller(p_sale_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.sales s
    join public.organization_members om
      on om.id = s.seller_member_id
    where public.cp_org_has_service(om.organization_id)
      and s.id = p_sale_id
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.shares_organization_with(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.organization_members me
    join public.organization_members other_member
      on other_member.organization_id = me.organization_id
    where public.cp_org_has_service(me.organization_id)
      and me.user_id = auth.uid()
      and me.status = 'active'
      and other_member.user_id = p_user_id
      and other_member.status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.create_sale(p_event_id uuid, p_ticket_type_id uuid, p_quantity integer, p_buyer_first_name text, p_buyer_last_name text, p_buyer_dni text, p_buyer_phone text, p_buyer_email text DEFAULT NULL::text)
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


  -- =======================================================
  -- 1. Usuario autenticado
  -- =======================================================

  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para registrar una venta';
  end if;


  -- =======================================================
  -- 2. Cantidad
  -- =======================================================

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  if p_quantity > 100 then
    raise exception 'No se pueden vender más de 100 entradas en una sola operación';
  end if;


  -- =======================================================
  -- 3. Datos obligatorios del comprador
  -- =======================================================

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


  -- =======================================================
  -- 4. Evento + tanda
  -- Bloqueamos la tanda durante la venta.
  -- =======================================================

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


  -- =======================================================
  -- 5. Evento habilitado para vender
  -- =======================================================

  if v_event_status not in ('upcoming', 'active') then
    raise exception 'Este evento no está habilitado para vender entradas';
  end if;


  -- =======================================================
  -- 6. Identificamos vendedor y rol
  -- =======================================================

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


  -- =======================================================
  -- 7. ORGANIZADOR
  -- =======================================================

  if v_seller_role = 'organizer' then

    v_sale_channel := 'organizer';


  -- =======================================================
  -- 8. RRPP
  -- =======================================================

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


  -- =======================================================
  -- 9. VENDEDOR DE PUERTA
  -- =======================================================

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


  -- =======================================================
  -- 10. CONTROLADOR u otro rol
  -- =======================================================

  else

    raise exception 'Tu usuario no tiene permiso para registrar ventas';

  end if;


  -- =======================================================
  -- 11. Estado de la tanda
  -- =======================================================

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


  -- =======================================================
  -- 12. Fechas propias de la tanda
  -- =======================================================

  if v_sales_start is not null
     and now() < v_sales_start then
    raise exception 'La venta de esta tanda todavía no comenzó';
  end if;

  if v_sales_end is not null
     and now() > v_sales_end then
    raise exception 'La venta de esta tanda ya finalizó';
  end if;


  -- =======================================================
  -- 13. Entradas vendidas
  -- =======================================================

  select count(*)::integer
  into v_sold

  from public.tickets t

  where t.ticket_type_id = p_ticket_type_id
    and t.status <> 'cancelled';


  -- =======================================================
  -- 14. Control de cupo
  -- =======================================================

  if v_sold + p_quantity > v_ticket_capacity then

    raise exception
      'No hay suficientes entradas disponibles. Disponibles: %',
      v_ticket_capacity - v_sold;

  end if;


  -- =======================================================
  -- 15. Crear comprador
  -- =======================================================

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


  -- =======================================================
  -- 16. Total
  -- =======================================================

  v_total :=
    v_ticket_price * p_quantity::bigint;


  -- =======================================================
  -- 17. Crear venta
  -- =======================================================

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


  -- =======================================================
  -- 18. Detalle
  -- =======================================================

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


  -- =======================================================
  -- 19. Tickets individuales
  -- =======================================================

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


  -- =======================================================
  -- 20. Agotamiento automático
  -- =======================================================

  if v_sold + p_quantity >= v_ticket_capacity then

    update public.ticket_types

    set
      status = 'sold_out',
      updated_at = now()

    where id = p_ticket_type_id;

  end if;


  -- =======================================================
  -- 21. Auditoría
  -- =======================================================

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


  -- =======================================================
  -- 22. Resultado
  -- =======================================================

  return query
  select
    v_sale_id,
    v_buyer_id,
    v_total,
    p_quantity;

end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_ticket_manual(p_event_id uuid, p_manual_code text)
 RETURNS TABLE(result text, ticket_id uuid, buyer_name text, buyer_dni text, ticket_type text, validated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare

  v_event_status public.event_status;

  v_actor_member_id uuid;

  v_ticket_id uuid;
  v_ticket_status public.ticket_status;
  v_used_at timestamptz;

  v_buyer_name text;
  v_buyer_dni text;
  v_ticket_type text;

  v_code text;

begin
  if not public.is_platform_admin() and not exists (
    select 1 from public.events e where e.id = p_event_id
      and public.cp_org_has_service(e.organization_id)
  ) then
    raise exception 'La organizacion necesita una suscripcion activa.';
  end if;


  -- =======================================================
  -- 1. Debe haber usuario autenticado
  -- =======================================================

  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para validar entradas';
  end if;


  -- =======================================================
  -- 2. Normalizamos el código
  -- =======================================================

  v_code := upper(btrim(p_manual_code));

  if v_code = '' then
    raise exception 'Debes ingresar un código de validación';
  end if;


  -- =======================================================
  -- 3. Comprobamos que el evento exista
  -- =======================================================

  select e.status
  into v_event_status
  from public.events e
  where e.id = p_event_id;


  if not found then
    raise exception 'El evento no existe';
  end if;


  -- Para el ingreso real el evento debe estar ACTIVO
  if v_event_status <> 'active' then
    raise exception 'El evento no está habilitado para control de ingreso';
  end if;


  -- =======================================================
  -- 4. Identificamos al usuario dentro de la organización
  -- =======================================================

  select om.id
  into v_actor_member_id
  from public.organization_members om
  join public.events e
    on e.organization_id = om.organization_id
  where e.id = p_event_id
    and om.user_id = auth.uid()
    and om.status = 'active'
  limit 1;


  -- =======================================================
  -- 5. Permisos
  --
  -- Puede validar:
  -- ADMIN CAPITAL PASS
  -- ORGANIZADOR del evento
  -- CONTROLADOR asignado al evento
  -- =======================================================

  if not (
    public.is_platform_admin()

    or public.is_event_organizer(p_event_id)

    or exists (
      select 1
      from public.event_staff es
      join public.organization_members om
        on om.id = es.organization_member_id
      where es.event_id = p_event_id
        and es.staff_role = 'controller'
        and es.active = true
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  ) then

    raise exception
      'No tienes permiso para controlar ingresos en este evento';

  end if;


  -- =======================================================
  -- 6. Buscamos la entrada y BLOQUEAMOS esa fila
  --
  -- Esto impide que dos celulares validen
  -- la misma entrada simultáneamente.
  -- =======================================================

  select
    t.id,
    t.status,
    t.used_at,

    b.first_name || ' ' || b.last_name,
    b.dni,
    tt.name

  into
    v_ticket_id,
    v_ticket_status,
    v_used_at,

    v_buyer_name,
    v_buyer_dni,
    v_ticket_type

  from public.tickets t

  join public.sales s
    on s.id = t.sale_id

  join public.buyers b
    on b.id = s.buyer_id

  join public.ticket_types tt
    on tt.id = t.ticket_type_id

  where t.event_id = p_event_id
    and upper(t.manual_code) = v_code

  for update of t;


  -- =======================================================
  -- 7. Código inexistente
  -- =======================================================

  if not found then

    insert into public.entry_scans (
      event_id,
      ticket_id,
      controller_member_id,
      method,
      result
    )
    values (
      p_event_id,
      null,
      v_actor_member_id,
      'manual',
      'invalid'
    );


    return query
    select
      'invalid'::text,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::timestamptz;

    return;

  end if;


  -- =======================================================
  -- 8. Entrada anulada
  -- =======================================================

  if v_ticket_status = 'cancelled' then

    insert into public.entry_scans (
      event_id,
      ticket_id,
      controller_member_id,
      method,
      result
    )
    values (
      p_event_id,
      v_ticket_id,
      v_actor_member_id,
      'manual',
      'cancelled'
    );


    return query
    select
      'cancelled'::text,
      v_ticket_id,
      v_buyer_name,
      v_buyer_dni,
      v_ticket_type,
      null::timestamptz;

    return;

  end if;


  -- =======================================================
  -- 9. Entrada ya utilizada
  -- =======================================================

  if v_ticket_status = 'used' then

    insert into public.entry_scans (
      event_id,
      ticket_id,
      controller_member_id,
      method,
      result
    )
    values (
      p_event_id,
      v_ticket_id,
      v_actor_member_id,
      'manual',
      'already_used'
    );


    return query
    select
      'already_used'::text,
      v_ticket_id,
      v_buyer_name,
      v_buyer_dni,
      v_ticket_type,
      v_used_at;

    return;

  end if;


  -- =======================================================
  -- 10. Entrada válida
  -- La marcamos como USED
  -- =======================================================

  update public.tickets
  set
    status = 'used',
    used_at = now(),
    updated_at = now()
  where id = v_ticket_id
  returning used_at
  into v_used_at;


  -- =======================================================
  -- 11. Registramos el ingreso
  -- =======================================================

  insert into public.entry_scans (
    event_id,
    ticket_id,
    controller_member_id,
    method,
    result
  )
  values (
    p_event_id,
    v_ticket_id,
    v_actor_member_id,
    'manual',
    'valid'
  );


  -- =======================================================
  -- 12. Resultado
  -- =======================================================

  return query
  select
    'valid'::text,
    v_ticket_id,
    v_buyer_name,
    v_buyer_dni,
    v_ticket_type,
    v_used_at;

end;
$function$;

commit;
