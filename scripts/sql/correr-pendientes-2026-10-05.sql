-- Migraciones pendientes al 2026-10-05, todas juntas en un solo paso.
-- Pegar entero en el SQL Editor de Supabase y correr UNA vez.
--
-- Corre todo dentro de una sola transaccion: si algo falla, no se aplica
-- nada (no queda a medias) y se puede volver a correr despues de arreglarlo.
-- Todas son seguras de correr aunque alguna ya se haya aplicado (add column
-- if not exists / create or replace).
--
-- Incluye, en este orden:
--   20261007_seguimiento_envio_whatsapp.sql
--   20261011_snapshot_cuenta_mp_venta_online.sql
--   20261014_snapshot_cuenta_mp_recarga_socio.sql
--   20261016_renovacion_anticipada_y_cobro_por_intento.sql
--   20261017_recargas_repetidas_y_mesas_de_socio.sql
--
-- Despues correr scripts/sql/verificar-migraciones.sql: todo tiene que dar ok.

begin;

-- =====================================================================
-- 20261007_seguimiento_envio_whatsapp.sql
-- =====================================================================

-- El organizador pidio poder ver, para las ventas en persona (puerta,
-- RRPP, organizador -- las que se entregan por WhatsApp, no por mail
-- automatico), cuales ya se mandaron y cuales todavia estan pendientes de
-- que el vendedor le pegue al boton de WhatsApp. No hay forma de saber si
-- el mensaje realmente llego o se leyo (eso requeriria la API paga de
-- WhatsApp Business), pero SI se puede registrar el momento en que el
-- vendedor efectivamente abrio WhatsApp para mandarla -- mismo patron que
-- ya existe para el mail (sales.ticket_email_sent_at).

alter table public.sales add column if not exists whatsapp_sent_at timestamptz;

-- =====================================================================
-- 20261011_snapshot_cuenta_mp_venta_online.sql
-- =====================================================================

-- Bug real encontrado en la ronda de auditoria de la suscripcion de
-- Mercado Pago del organizador: reconectar (o cambiar) la cuenta de
-- Mercado Pago de una organizacion pisa organization_mercadopago_accounts
-- (organization_id es primary key, una sola fila). applySalePayment
-- comparaba el pago real contra el mp_user_id VIGENTE en el momento de
-- confirmar, no contra el que realmente se uso para generar la
-- preference del comprador -- si el organizador reconectaba entre que el
-- comprador abria el checkout y que el pago se confirmaba, el
-- collector_id real del pago (la cuenta vieja) nunca coincidia con el
-- vigente (la cuenta nueva), verifiedPayment tiraba excepcion siempre, y
-- la venta quedaba PARA SIEMPRE sin confirmar: el comprador pagaba, el
-- dinero entraba a la cuenta vieja del organizador, y nunca se generaba
-- la entrada ni salia el mail con el QR. Ningun reintento del webhook lo
-- arreglaba porque no es un error transitorio.
--
-- Se guarda un snapshot de que cuenta MP se uso para CADA venta online,
-- en el mismo momento en que ya se guarda el total realmente cobrado
-- (mismo criterio: "la verdad de cada venta es la del momento en que se
-- genero su cobro, no la que haya despues").

alter table public.sales add column if not exists mercadopago_collector_id bigint;

-- La funcion crecio un parametro (antes (uuid, bigint), ahora (uuid,
-- bigint, bigint)): para Postgres es una funcion DISTINTA, no un
-- reemplazo -- sin este drop, la version vieja de 2 argumentos queda
-- huerfana (sin uso, pero nunca desaparece sola).
drop function if exists public.set_online_sale_charged_total(uuid, bigint);

create or replace function public.set_online_sale_charged_total(
  p_sale_id uuid, p_total_charged_minor bigint, p_mercadopago_collector_id bigint default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.sales
  set total_charged_minor = p_total_charged_minor,
      mercadopago_collector_id = coalesce(p_mercadopago_collector_id, mercadopago_collector_id),
      updated_at = now()
  where id = p_sale_id and channel = 'online' and status = 'pending_approval';

  if not found then
    raise exception 'Venta online inexistente o ya procesada';
  end if;
end;
$$;
revoke all on function public.set_online_sale_charged_total(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.set_online_sale_charged_total(uuid, bigint, bigint) to service_role;

-- =====================================================================
-- 20261014_snapshot_cuenta_mp_recarga_socio.sql
-- =====================================================================

-- Mismo bug ya arreglado para ventas de entradas (20261011), encontrado en
-- esta ronda pero nunca portado a la recarga de saldo del socio premium:
-- applyTopupPayment comparaba el pago real contra la cuenta de Mercado Pago
-- VIGENTE del organizador al momento de confirmar, no contra la que
-- realmente se uso para generar la preference que vio el socio. Si el
-- organizador reconectaba/cambiaba de cuenta de Mercado Pago entre que el
-- socio abria el checkout de recarga y que el pago se confirmaba, el dinero
-- quedaba acreditado en la cuenta vieja pero la verificacion comparaba
-- contra la nueva: nunca coincidian, la recarga quedaba sin acreditar para
-- siempre (no es un error transitorio, ningun reintento del webhook lo
-- arregla), y el socio se quedaba pago y sin saldo.
--
-- A diferencia de sales/tickets, wallet_topups ya tiene GRANT ALL a
-- service_role (20260984), asi que alcanza con una columna nueva -- no
-- hace falta ninguna funcion security definer para setearla.

alter table public.wallet_topups add column if not exists mercadopago_collector_id bigint;

-- =====================================================================
-- 20261016_renovacion_anticipada_y_cobro_por_intento.sql
-- =====================================================================

-- Auditoria de la suscripcion del organizador. Bugs que arregla:
--
-- 1. No se podia renovar antes de vencer: cp_prepare_checkout rechazaba
--    cualquier pago con el servicio activo, aunque el mail de aviso (5 dias
--    antes) decia "renovala antes de esa fecha". Cada organizador quedaba
--    bloqueado (el y todo su equipo) el dia del vencimiento hasta pagar.
--    Ahora se puede renovar desde 7 dias antes.
--
-- 2. Renovar antes perdia dias: cp_record_payment calculaba el periodo desde
--    la fecha del pago. Ahora un pago nuevo arranca donde termina el ultimo
--    periodo pago de la organizacion (period_start), asi se suma.
--
-- 3. Pagar el link de un plan despues de haber elegido otro dejaba al
--    organizador pago y sin servicio: cp_prepare_checkout (20260963)
--    reescribia plan y monto de la MISMA solicitud, y la verificacion
--    comparaba el pago con el monto nuevo -- lo rechazaba para siempre.
--    Ahora, si cambia el plan o el precio, se crea una solicitud nueva y
--    cada link de pago queda atado a su propio monto. Esto tambien hace
--    que un cambio de precio del plan llegue a quien ya paga en su proxima
--    renovacion (antes se reusaba el monto viejo para siempre).
--
-- 4. Un pago ya registrado (ej. un reembolso que llega despues) se valida
--    contra el monto que se grabo, no contra el de la solicitud -- que
--    pudo haber cambiado.
--
-- 5. Upgrade de plan: recalcular el monto de un cobro pendiente que YA
--    tenia link de pago (20260931) hacia que, si el organizador pagaba
--    ese link viejo, el pago no coincidiera con el monto nuevo y nunca se
--    aplicara. Ahora el cobro viejo queda 'superseded' (si se paga igual,
--    se aprueba con su propio monto) y se crea uno nuevo. Tambien se
--    prorratea desde el inicio real del periodo y se rechaza mezclar un
--    plan anual con uno mensual.
--
-- 6. cp_org_has_stock_access elegia el plan de la fila de
--    organization_subscriptions actualizada mas recientemente -- "Verificar
--    mi pago" refresca todas las solicitudes viejas, asi que una
--    organizacion con mas de una solicitud podia quedar evaluada con el
--    plan VIEJO. Ahora gana la de vencimiento mas lejano.

alter table public.subscription_payments add column if not exists period_start timestamptz;

create or replace function public.cp_record_payment(
  p_signup_id uuid, p_payment_id text, p_status text, p_amount numeric, p_currency text,
  p_paid_at timestamptz, p_updated_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.subscription_signups%rowtype;
  existing public.subscription_payments%rowtype;
  v_paid_at timestamptz := p_paid_at;
  v_start timestamptz;
  v_end timestamptz;
  v_prev_end timestamptz;
begin
  select * into s from public.subscription_signups where id = p_signup_id for update;
  if not found then raise exception 'Solicitud inexistente'; end if;

  -- Serializa los cobros de la misma organizacion: el calculo de donde
  -- arranca un periodo nuevo depende de los otros pagos de la organizacion.
  if s.organization_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('cp_subscription:' || s.organization_id::text, 0));
  end if;

  select * into existing from public.subscription_payments where payment_id = p_payment_id;
  if found and existing.signup_id <> p_signup_id then
    raise exception 'El cobro ya pertenece a otra solicitud.';
  end if;

  if s.frequency_months is null or s.frequency_months not in (1, 12) then
    raise exception 'El cobro no coincide con el plan contratado.';
  end if;
  if existing.payment_id is not null then
    if p_amount <> existing.amount or p_currency <> existing.currency then
      raise exception 'El cobro no coincide con el plan contratado.';
    end if;
  elsif s.expected_amount is null or p_amount <> s.expected_amount or p_currency <> s.expected_currency then
    raise exception 'El cobro no coincide con el plan contratado.';
  end if;

  if p_status = 'approved' and (p_paid_at is null or p_paid_at > now() + interval '5 minutes') then
    raise exception 'Fecha de cobro inválida.';
  end if;

  if existing.payment_id is not null and existing.period_end is not null then
    -- El periodo de un pago ya registrado no se recalcula nunca (un
    -- reintento o un reembolso solo cambian el estado).
    v_paid_at := existing.paid_at;
    v_start := existing.period_start;
    v_end := existing.period_end;
  elsif p_status = 'approved' then
    select max(p.period_end) into v_prev_end
    from public.subscription_payments p
    join public.subscription_signups ss on ss.id = p.signup_id
    where ss.organization_id = s.organization_id and p.status = 'approved'
      and p.payment_id <> p_payment_id;
    v_start := greatest(p_paid_at, coalesce(v_prev_end, p_paid_at));
    v_end := v_start + make_interval(months => s.frequency_months);
  else
    v_start := p_paid_at;
    v_end := p_paid_at + make_interval(months => s.frequency_months);
  end if;

  insert into public.subscription_payments (
    payment_id, signup_id, status, amount, currency, paid_at, period_start, period_end, provider_updated_at
  ) values (
    p_payment_id, p_signup_id, p_status, p_amount, p_currency, v_paid_at, v_start, v_end, p_updated_at
  ) on conflict (payment_id) do update set
    status = excluded.status,
    paid_at = excluded.paid_at, period_start = excluded.period_start, period_end = excluded.period_end,
    provider_updated_at = excluded.provider_updated_at
  where excluded.provider_updated_at >= subscription_payments.provider_updated_at;
  perform public.cp_refresh_subscription(p_signup_id);
end;
$$;
revoke all on function public.cp_record_payment(uuid, text, text, numeric, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.cp_record_payment(uuid, text, text, numeric, text, timestamptz, timestamptz)
  to service_role;

-- Igual que 20260928, solo cambia current_period_start: con la renovacion
-- anticipada el periodo pago arranca en period_start, no en la fecha del pago.
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
    status = internal_status, current_period_start = coalesce(p.period_start, p.paid_at), current_period_end = p.period_end,
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
      internal_status, coalesce(p.period_start, p.paid_at), p.period_end, s.organization_name, plan.name,
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

create or replace function public.cp_prepare_checkout(p_user_id uuid, p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  org_id uuid;
  s public.subscription_signups%rowtype;
  p public.subscription_plans%rowtype;
  u auth.users%rowtype;
  profile public.profiles%rowtype;
  org public.organizations%rowtype;
  v_frequency integer;
  v_period_end timestamptz;
begin
  org_id := public.cp_ensure_account(p_user_id);
  select * into org from public.organizations where id = org_id;

  -- Con el servicio activo solo se puede renovar dentro de los ultimos 7
  -- dias del periodo pago (lo que se pague se suma al vencimiento, ver
  -- cp_record_payment). Una cuenta de cortesia nunca necesita pagar.
  if public.cp_org_has_service(org_id) then
    if org.complimentary then
      raise exception 'Tu cuenta es de cortesía: no hace falta pagar.';
    end if;
    select max(pay.period_end) into v_period_end
    from public.subscription_payments pay
    join public.subscription_signups ss on ss.id = pay.signup_id
    where ss.organization_id = org_id and pay.status = 'approved';
    if v_period_end is null or v_period_end > now() + interval '7 days' then
      raise exception 'El servicio ya está activo. Vas a poder renovar desde 7 días antes del vencimiento.';
    end if;
  end if;

  select * into p from public.subscription_plans where id = p_plan_id and active;
  if not found or p.price_minor <= 0 then raise exception 'El plan no está disponible.'; end if;
  v_frequency := case p.billing_interval when 'yearly' then 12 else 1 end;

  -- Se reusa la ultima solicitud solo si es exactamente el mismo cobro
  -- (plan, precio vigente y moneda). Si no, solicitud nueva: nunca se
  -- reescribe el monto de una solicitud que ya pudo tener un link de pago.
  select * into s from public.subscription_signups
    where user_id = p_user_id and organization_id = org_id
      and status not in ('cancelled', 'rejected', 'expired')
      and coalesce(mp_status, '') <> 'cancelled'
    order by created_at desc limit 1 for update;
  if found and s.plan_id = p.id and s.expected_amount = p.price_minor
    and s.expected_currency = p.currency and s.frequency_months = v_frequency then
    return to_jsonb(s);
  end if;

  select * into u from auth.users where id = p_user_id;
  select * into profile from public.profiles where id = p_user_id;
  insert into public.subscription_signups (
    user_id, organization_id, plan_id, first_name, last_name, organization_name,
    email, status, expected_amount, expected_currency, frequency_months, account_created_at
  ) values (
    p_user_id, org_id, p.id, profile.first_name, profile.last_name, org.name,
    u.email, 'payment_pending', p.price_minor, p.currency, v_frequency, now()
  ) returning * into s;
  return to_jsonb(s);
end;
$$;
revoke all on function public.cp_prepare_checkout(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cp_prepare_checkout(uuid, uuid) to service_role;

create or replace function public.cp_prepare_plan_upgrade(p_user_id uuid, p_to_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org_id uuid;
  v_from_plan_id uuid;
  v_from_frequency integer;
  v_to_frequency integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_from_price bigint;
  v_to_plan public.subscription_plans%rowtype;
  v_total_days numeric;
  v_remaining_days numeric;
  v_diff_minor bigint;
  v_charge public.plan_upgrade_charges%rowtype;
begin
  select om.organization_id into v_org_id
  from public.organization_members om
  where om.user_id = p_user_id and om.role = 'organizer' and om.status = 'active'
  limit 1;
  if v_org_id is null then raise exception 'No administrás ninguna organización.'; end if;

  if not public.cp_org_has_service(v_org_id) then
    raise exception 'Tu suscripción no está activa.';
  end if;

  select * into v_to_plan from public.subscription_plans where id = p_to_plan_id and active;
  if not found then raise exception 'El plan elegido no está disponible.'; end if;

  -- Precio de origen = lo que efectivamente se pago (20260931). El periodo
  -- arranca en period_start (renovacion anticipada), no en la fecha del pago.
  select s.plan_id, s.frequency_months, coalesce(p.period_start, p.paid_at), p.period_end, p.amount
  into v_from_plan_id, v_from_frequency, v_period_start, v_period_end, v_from_price
  from public.subscription_payments p
  join public.subscription_signups s on s.id = p.signup_id
  where s.organization_id = v_org_id and p.status = 'approved'
    and p.paid_at <= now() and p.period_end > now()
  order by p.period_end desc limit 1;

  if v_from_plan_id is null then raise exception 'No encontramos tu período activo.'; end if;
  if v_from_plan_id = p_to_plan_id then raise exception 'Ya estás en ese plan.'; end if;
  v_to_frequency := case v_to_plan.billing_interval when 'yearly' then 12 else 1 end;
  if v_from_frequency <> v_to_frequency then
    raise exception 'Para pasar de un plan mensual a uno anual (o al revés), hacelo al renovar.';
  end if;

  if exists (
    select 1 from public.plan_upgrade_charges
    where organization_id = v_org_id and to_plan_id = p_to_plan_id
      and period_end_at_charge = v_period_end and status = 'approved'
  ) then
    raise exception 'Ya actualizaste tu plan para este período.';
  end if;

  v_total_days := greatest(extract(epoch from (v_period_end - v_period_start)) / 86400.0, 1);
  v_remaining_days := greatest(extract(epoch from (v_period_end - now())) / 86400.0, 0);
  v_diff_minor := round((v_to_plan.price_minor - v_from_price) * v_remaining_days / v_total_days);

  if v_diff_minor <= 0 then
    raise exception 'El plan elegido no cuesta más que tu plan actual.';
  end if;

  select * into v_charge from public.plan_upgrade_charges
  where organization_id = v_org_id and to_plan_id = p_to_plan_id
    and period_end_at_charge = v_period_end and status = 'pending'
  for update;

  if found then
    -- Doble click o vuelta al rato: mismo cobro.
    if v_charge.amount_minor = v_diff_minor
      or (v_charge.checkout_url is not null and v_charge.created_at > now() - interval '1 hour') then
      return to_jsonb(v_charge);
    end if;
    -- Sin link de pago generado todavia: se puede corregir el monto.
    if v_charge.checkout_url is null then
      update public.plan_upgrade_charges set amount_minor = v_diff_minor, currency = v_to_plan.currency
      where id = v_charge.id returning * into v_charge;
      return to_jsonb(v_charge);
    end if;
    -- Ya tenia link con el monto viejo: ese link sigue siendo valido por su
    -- propio monto (si lo paga, cp_apply_upgrade_payment lo aprueba), pero
    -- deja de ofrecerse.
    update public.plan_upgrade_charges set status = 'superseded' where id = v_charge.id;
  end if;

  insert into public.plan_upgrade_charges (
    organization_id, from_plan_id, to_plan_id, amount_minor, currency, period_end_at_charge
  ) values (
    v_org_id, v_from_plan_id, p_to_plan_id, v_diff_minor, v_to_plan.currency, v_period_end
  )
  on conflict (organization_id, to_plan_id, period_end_at_charge) where status = 'pending'
  do nothing
  returning * into v_charge;

  if v_charge.id is null then
    select * into v_charge from public.plan_upgrade_charges
    where organization_id = v_org_id and to_plan_id = p_to_plan_id
      and period_end_at_charge = v_period_end and status = 'pending'
    order by created_at desc limit 1;
  end if;

  return to_jsonb(v_charge);
end;
$$;
revoke all on function public.cp_prepare_plan_upgrade(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cp_prepare_plan_upgrade(uuid, uuid) to service_role;

-- Igual que 20260948, solo cambia el orden para elegir el plan vigente.
create or replace function public.cp_org_has_stock_access(p_organization_id uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_plan_code text;
  v_trial_ends_at timestamptz;
  v_has_upgrade boolean;
begin
  if auth.role() = 'authenticated' and not public.is_platform_admin() and not exists (
    select 1 from public.organization_members om
    where om.organization_id = p_organization_id and om.user_id = auth.uid() and om.status = 'active'
  ) then
    return false;
  end if;

  if not public.cp_org_has_service(p_organization_id) then
    return false;
  end if;

  if exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.stock_access_blocked
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.complimentary
  ) then
    return true;
  end if;

  select sp.code into v_plan_code
  from public.organization_subscriptions os
  join public.subscription_plans sp on sp.id = os.plan_id
  where os.organization_id = p_organization_id
  order by os.current_period_end desc nulls last, os.updated_at desc
  limit 1;

  if v_plan_code = 'gestion_avanzada' then
    return true;
  end if;

  select exists (
    select 1 from public.plan_upgrade_charges c
    join public.subscription_plans sp on sp.id = c.to_plan_id
    where c.organization_id = p_organization_id and c.status = 'approved'
      and sp.code = 'gestion_avanzada' and c.period_end_at_charge >= now()
  ) into v_has_upgrade;

  if v_has_upgrade then
    return true;
  end if;

  select ends_at into v_trial_ends_at from public.stock_trial where organization_id = p_organization_id;

  if v_trial_ends_at is null then
    insert into public.stock_trial (organization_id, starts_at, ends_at)
    values (p_organization_id, now(), now() + interval '7 days')
    on conflict (organization_id) do nothing
    returning ends_at into v_trial_ends_at;

    if v_trial_ends_at is null then
      select ends_at into v_trial_ends_at from public.stock_trial where organization_id = p_organization_id;
    end if;
  end if;

  return v_trial_ends_at is not null and now() <= v_trial_ends_at;
end;
$$;
revoke all on function public.cp_org_has_stock_access(uuid) from public, anon;
grant execute on function public.cp_org_has_stock_access(uuid) to authenticated, service_role;

-- =====================================================================
-- 20261017_recargas_repetidas_y_mesas_de_socio.sql
-- =====================================================================

-- Auditoria de membresia (app del socio). Bugs que arregla:
--
-- 1. CRITICO: una mesa reservada desde la app del socio para un evento de
--    otro dia se cancelaba sola a las 6 horas (cp_expire_stale_member_orders
--    trataba igual un pedido de barra que una reserva de mesa): la mesa
--    volvia a quedar disponible para otro y el socio llegaba sin mesa. Ahora
--    una reserva de mesa a pagar en el lugar solo se cancela sola cuando el
--    evento ya termino o se cancelo, y una mesa ya pagada con saldo nunca se
--    cancela sola (la plata ya se cobro y la venta ya esta confirmada: lo
--    resuelve el organizador).
--
-- 2. Recarga pagada dos veces: si el socio pagaba dos veces el mismo link de
--    Mercado Pago (dos pestañas, doble toque), el segundo pago aprobado no se
--    acreditaba nunca -- la plata quedaba cobrada sin saldo. Ahora cada pago
--    aprobado distinto se acredita en su propia fila de wallet_topups
--    (mp_payment_id sigue siendo unico: un mismo pago nunca se acredita dos
--    veces).
--
-- 3. Un reembolso se aplicaba a la recarga sin mirar de que pago era: el
--    reembolso de un pago repetido podia descontar el saldo de la recarga
--    original. Ahora el reembolso se aplica solo a la fila de ESE pago.

-- Ya la agrega 20261014; se repite por si esa no se corrio todavia (la
-- funcion de abajo la copia en las recargas repetidas).
alter table public.wallet_topups add column if not exists mercadopago_collector_id bigint;

create or replace function public.member_wallet_topup_apply(p_topup_id uuid, p_payment_id text, p_status text)
returns table(applied boolean, new_status text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_topup public.wallet_topups%rowtype;
  v_other public.wallet_topups%rowtype;
  v_target text;
  v_balance bigint;
  v_debit bigint;
  v_extra_id uuid;
begin
  select * into v_topup from public.wallet_topups where id = p_topup_id for update;
  if not found then
    raise exception 'La recarga no existe.';
  end if;

  v_target := case
    when p_status = 'approved' then 'approved'
    when p_status in ('refunded', 'charged_back') then 'refunded'
    when p_status in ('rejected', 'cancelled') then 'rejected'
    else 'pending'
  end;

  if v_target = 'pending' then
    return query select false, v_topup.status;
    return;
  end if;

  -- Un pago que ya quedo registrado en otra fila (un pago repetido del
  -- mismo link, ver abajo) se procesa sobre esa fila.
  if p_payment_id is not null and v_topup.mp_payment_id is distinct from p_payment_id then
    select * into v_other from public.wallet_topups where mp_payment_id = p_payment_id for update;
    if found then
      if v_other.member_id <> v_topup.member_id then
        raise exception 'El pago pertenece a otra recarga.';
      end if;
      v_topup := v_other;
    end if;
  end if;

  -- Un intento rechazado puede reintentarse con la misma preferencia y
  -- terminar aprobado, por eso 'rejected' tambien puede pasar a 'approved'.
  if v_target = 'approved' and v_topup.status in ('pending', 'rejected') then
    update public.premium_members set balance_minor = balance_minor + v_topup.amount_minor, updated_at = now()
    where id = v_topup.member_id;

    insert into public.wallet_transactions (member_id, amount_minor, kind, note)
    values (v_topup.member_id, v_topup.amount_minor, 'topup', 'Recarga con Mercado Pago');

    update public.wallet_topups set status = 'approved', mp_payment_id = p_payment_id, approved_at = now() where id = v_topup.id;
    return query select true, 'approved'::text;
    return;
  end if;

  -- Pago repetido del mismo link: la recarga ya se acredito con OTRO pago.
  -- Este tambien se cobro, asi que tambien se acredita, en una fila propia.
  if v_target = 'approved' and v_topup.status in ('approved', 'refunded')
    and v_topup.mp_payment_id is distinct from p_payment_id and p_payment_id is not null then
    insert into public.wallet_topups (organization_id, member_id, amount_minor, status, mp_payment_id, approved_at, mercadopago_collector_id)
    values (v_topup.organization_id, v_topup.member_id, v_topup.amount_minor, 'approved', p_payment_id, now(), v_topup.mercadopago_collector_id)
    on conflict (mp_payment_id) where mp_payment_id is not null do nothing
    returning id into v_extra_id;

    if v_extra_id is null then
      return query select false, 'approved'::text;
      return;
    end if;

    update public.premium_members set balance_minor = balance_minor + v_topup.amount_minor, updated_at = now()
    where id = v_topup.member_id;
    insert into public.wallet_transactions (member_id, amount_minor, kind, note)
    values (v_topup.member_id, v_topup.amount_minor, 'topup', 'Recarga con Mercado Pago (pago repetido)');
    return query select true, 'approved'::text;
    return;
  end if;

  if v_target = 'rejected' and v_topup.status = 'pending' then
    update public.wallet_topups set status = 'rejected' where id = v_topup.id;
    return query select false, 'rejected'::text;
    return;
  end if;

  -- Pago devuelto despues de acreditar: solo si es el pago de ESTA fila. Se
  -- descuenta lo que todavia quede (no se puede quitar lo que el socio ya
  -- consumio).
  if v_target = 'refunded' and v_topup.status = 'approved' and v_topup.mp_payment_id is not distinct from p_payment_id then
    select balance_minor into v_balance from public.premium_members where id = v_topup.member_id for update;
    v_debit := least(coalesce(v_balance, 0), v_topup.amount_minor);
    if v_debit > 0 then
      update public.premium_members set balance_minor = balance_minor - v_debit, updated_at = now() where id = v_topup.member_id;
      insert into public.wallet_transactions (member_id, amount_minor, kind, note)
      values (v_topup.member_id, -v_debit, 'adjustment', 'Recarga reembolsada por Mercado Pago');
    end if;
    update public.wallet_topups set status = 'refunded' where id = v_topup.id;
    return query select true, 'refunded'::text;
    return;
  end if;

  return query select false, v_topup.status;
end;
$function$;

revoke all on function public.member_wallet_topup_apply(uuid, text, text) from public, anon, authenticated;
grant execute on function public.member_wallet_topup_apply(uuid, text, text) to service_role;

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
    select o.id, o.organization_id
    from public.member_orders o
    left join public.events e on e.id = o.event_id
    where o.status = 'pending'
      and (
        -- Pedido de barra: si nadie lo atendio en p_hours horas, se cancela.
        (o.kind = 'consumo' and o.created_at < now() - (greatest(p_hours, 1) || ' hours')::interval)
        -- Reserva de mesa a pagar en el lugar: recien cuando el evento ya
        -- paso (o se cancelo). Antes de eso es una reserva valida aunque se
        -- haya hecho dias antes.
        or (o.kind = 'mesa' and o.payment = 'en_barra' and (
          e.id is null
          or e.status in ('finished', 'cancelled')
          or coalesce(e.ends_at, e.starts_at + interval '12 hours', o.created_at + interval '7 days') < now()
        ))
        -- Mesa pagada con saldo: nunca se cancela sola.
      )
    order by o.created_at asc
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
