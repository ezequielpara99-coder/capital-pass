-- Bug real encontrado en revision: cp_org_has_stock_access(p_organization_id)
-- esta otorgada a "authenticated" (necesario porque el codigo del backend la
-- llama con el cliente de service_role, que en Supabase tambien pasa por el
-- rol "authenticated" segun como se configure -- en la practica el codigo
-- SIEMPRE la llama despues de validar membresia). El problema es que la
-- funcion recibe p_organization_id como parametro libre y nunca valida que
-- quien llama pertenezca a esa organizacion antes de, como efecto
-- secundario, arrancarle la prueba gratuita de 7 dias del modulo de stock
-- si todavia no la habia usado. Cualquier usuario logueado (aunque sea
-- bartender/rrpp/door_seller de OTRA organizacion) podia invocar el RPC de
-- PostgREST directo con el organization_id de un competidor y consumirle
-- la ventana de prueba sin que nadie de esa organizacion lo pidiera.
--
-- El resto de las funciones RPC de stock que reciben un organization_id
-- (assign_stock_to_bar, adjust_bar_stock, etc.) ya validan la membresia
-- contra auth.uid() antes de actuar; esta era la excepcion.
--
-- El chequeo nuevo solo se aplica cuando quien llama tiene un JWT real de
-- usuario (auth.role() = 'authenticated'). Las llamadas del backend con la
-- llave de service_role no tienen ese rol y siguen funcionando exactamente
-- igual que antes.
begin;

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
