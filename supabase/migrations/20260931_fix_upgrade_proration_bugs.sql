-- Dos bugs reales encontrados en la revision de cp_prepare_plan_upgrade:
--
-- 1. El precio "de origen" para prorratear se tomaba del precio ACTUAL del
--    plan (subscription_plans.price_minor), no de lo que la organizacion
--    realmente pago. Si un admin cambia el precio del plan basico a mitad
--    de mes (con el editor de /admin/suscripciones), la diferencia del
--    upgrade se recalculaba mal -- justo lo que ese editor promete que NO
--    iba a pasar ("no cambia lo que ya le cobraste a alguien este mes").
--
-- 2. Si ya existia un cobro de upgrade pendiente (por ejemplo, alguien
--    abrio el checkout y no completo el pago), volver a pedir el upgrade
--    dias despues reusaba el monto viejo (calculado con mas dias restantes)
--    en vez de recalcularlo -- podia terminar cobrando de mas.
begin;

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

  -- v_from_price sale de lo que efectivamente se pago este periodo
  -- (subscription_payments.amount), no del precio de lista actual del
  -- plan -- ese puede haber cambiado despues de que la organizacion pago.
  select s.plan_id, p.paid_at, p.period_end, p.amount
  into v_from_plan_id, v_period_start, v_period_end, v_from_price
  from public.subscription_payments p
  join public.subscription_signups s on s.id = p.signup_id
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

  -- Si ya habia un cobro pendiente para este mismo destino/periodo, se
  -- actualiza el monto con el recalculo de hoy (los dias restantes
  -- cambiaron) y se invalida el link de pago viejo -- /api/mercadopago/
  -- upgrade genera uno nuevo la proxima vez que haga falta.
  insert into public.plan_upgrade_charges (
    organization_id, from_plan_id, to_plan_id, amount_minor, currency, period_end_at_charge
  ) values (
    v_org_id, v_from_plan_id, p_to_plan_id, v_diff_minor, v_to_plan.currency, v_period_end
  )
  on conflict (organization_id, to_plan_id, period_end_at_charge) where status = 'pending'
  do update set amount_minor = excluded.amount_minor, checkout_url = null
  returning * into v_charge;

  return to_jsonb(v_charge);
end;
$$;
revoke all on function public.cp_prepare_plan_upgrade(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cp_prepare_plan_upgrade(uuid, uuid) to service_role;

commit;
