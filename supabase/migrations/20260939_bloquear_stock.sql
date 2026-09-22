-- El admin de la plataforma puede bloquear/desbloquear el acceso al modulo
-- de Stock de una organizacion puntual (por ejemplo, una cuenta de cortesia
-- que se paso de rosca) sin tocar el resto del servicio ni la cortesia.
begin;

alter table public.organizations add column if not exists stock_access_blocked boolean not null default false;

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

  -- Bloqueo puntual del admin: corta el acceso a Stock aunque el resto
  -- del servicio (cortesia o plan pago) siga activo.
  if exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.stock_access_blocked
  ) then
    return false;
  end if;

  -- Cuenta de cortesia: pack completo, sin prueba ni plan.
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
grant execute on function public.cp_org_has_stock_access(uuid) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
