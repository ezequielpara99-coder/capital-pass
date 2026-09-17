-- La prueba de 7 dias de stock ya no arranca cuando se activa la
-- suscripcion basica, sino la primera vez que la organizacion realmente
-- usa algo del modulo de stock/barras (panel de stock, asignar stock,
-- vender un trago, vender una mesa, etc). cp_org_has_stock_access pasa a
-- crear esa fila de prueba de forma perezosa, la primera vez que se
-- consulta y no existe todavia.
begin;

-- Vuelve a la version original: cp_refresh_subscription ya no crea la
-- fila de prueba de stock (eso ahora lo hace cp_org_has_stock_access).
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

-- Acceso al modulo de stock: plan "gestion avanzada" (siempre), o dentro
-- de la prueba de 7 dias -- que arranca justo ahora, la primera vez que
-- se llama esta funcion para esa organizacion sin tener ya una fila de
-- prueba creada.
create or replace function public.cp_org_has_stock_access(p_organization_id uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
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

  if v_trial_ends_at is null then
    -- Primer uso del modulo de stock para esta organizacion: arranca la
    -- prueba de 7 dias recien ahora.
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
grant execute on function public.cp_org_has_stock_access(uuid) to authenticated;

commit;
