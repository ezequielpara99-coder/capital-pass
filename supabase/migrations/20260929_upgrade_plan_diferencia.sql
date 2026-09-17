-- Actualizacion de plan (basica -> gestion avanzada) cobrando solo la
-- diferencia proporcional a los dias que le quedan del periodo ya pagado.
-- Es un cobro Checkout Pro unico, separado de las suscripciones normales,
-- para no interferir con la reconciliacion de renovaciones existente.
begin;

create table public.plan_upgrade_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  from_plan_id uuid not null references public.subscription_plans(id),
  to_plan_id uuid not null references public.subscription_plans(id),
  amount_minor bigint not null,
  currency text not null default 'ARS',
  period_end_at_charge timestamptz not null,
  status text not null default 'pending',
  mercadopago_payment_id text unique,
  checkout_url text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.plan_upgrade_charges enable row level security;
revoke all on public.plan_upgrade_charges from anon, authenticated;
grant all on public.plan_upgrade_charges to service_role;

-- Evita cobros de upgrade duplicados si el organizador hace doble click:
-- una sola fila "pending" por organizacion + plan destino + periodo.
create unique index plan_upgrade_charges_pending_uidx
  on public.plan_upgrade_charges (organization_id, to_plan_id, period_end_at_charge)
  where status = 'pending';

commit;

begin;

-- Calcula y registra cuanto hay que cobrar de diferencia para pasar de la
-- suscripcion activa actual a p_to_plan_id, prorrateado por los dias que
-- quedan del periodo ya pagado. Si ya hay un cobro pendiente para el mismo
-- destino y periodo, devuelve ese mismo (idempotente ante doble click).
create or replace function public.cp_prepare_plan_upgrade(p_user_id uuid, p_to_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org_id uuid;
  v_from_plan_id uuid;
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

  select s.plan_id, p.paid_at, p.period_end, pl.price_minor
  into v_from_plan_id, v_period_start, v_period_end, v_from_price
  from public.subscription_payments p
  join public.subscription_signups s on s.id = p.signup_id
  join public.subscription_plans pl on pl.id = s.plan_id
  where s.organization_id = v_org_id and p.status = 'approved'
    and p.paid_at <= now() and p.period_end > now()
  order by p.period_end desc limit 1;

  if v_from_plan_id is null then raise exception 'No encontramos tu período activo.'; end if;
  if v_from_plan_id = p_to_plan_id then raise exception 'Ya estás en ese plan.'; end if;

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
    where organization_id = v_org_id and to_plan_id = p_to_plan_id and period_end_at_charge = v_period_end
      and status = 'pending'
    order by created_at desc limit 1;
  end if;

  return to_jsonb(v_charge);
end;
$$;
revoke all on function public.cp_prepare_plan_upgrade(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cp_prepare_plan_upgrade(uuid, uuid) to service_role;

-- Guarda el link de pago generado para un cobro de upgrade ya preparado.
create or replace function public.cp_save_upgrade_checkout(p_charge_id uuid, p_checkout_url text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.plan_upgrade_charges set checkout_url = p_checkout_url
  where id = p_charge_id and status = 'pending';
end;
$$;
revoke all on function public.cp_save_upgrade_checkout(uuid, text) from public, anon, authenticated;
grant execute on function public.cp_save_upgrade_checkout(uuid, text) to service_role;

-- Aplica el resultado de un pago ya verificado (mismo patron que
-- cp_record_payment: el monto/moneda ya se validaron contra Mercado Pago
-- antes de llamar esta funcion). Idempotente ante reintentos del webhook.
create or replace function public.cp_apply_upgrade_payment(
  p_charge_id uuid, p_payment_id text, p_status text, p_amount numeric, p_currency text, p_paid_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.plan_upgrade_charges%rowtype;
begin
  select * into c from public.plan_upgrade_charges where id = p_charge_id for update;
  if not found then raise exception 'No se encontró el cobro de actualización.'; end if;
  if c.status = 'approved' then return; end if;

  if p_amount <> c.amount_minor or p_currency <> c.currency then
    raise exception 'El cobro no coincide con la actualización solicitada.';
  end if;

  update public.plan_upgrade_charges set
    status = case when p_status = 'approved' then 'approved' else 'rejected' end,
    mercadopago_payment_id = p_payment_id,
    paid_at = case when p_status = 'approved' then p_paid_at else null end
  where id = p_charge_id;
end;
$$;
revoke all on function public.cp_apply_upgrade_payment(uuid, text, text, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.cp_apply_upgrade_payment(uuid, text, text, numeric, text, timestamptz) to service_role;

-- El acceso a stock ahora tambien se otorga si la organizacion ya pago la
-- diferencia para actualizar a gestion avanzada dentro del periodo vigente
-- (sin depender de que el plan "de fondo" en organization_subscriptions se
-- haya actualizado, que puede pisarse con una renovacion de la basica).
create or replace function public.cp_org_has_stock_access(p_organization_id uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v_plan_code text;
  v_trial_ends_at timestamptz;
  v_has_upgrade boolean;
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
grant execute on function public.cp_org_has_stock_access(uuid) to authenticated;

commit;
