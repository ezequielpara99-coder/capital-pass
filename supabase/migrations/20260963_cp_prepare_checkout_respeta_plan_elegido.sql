-- cp_prepare_checkout: si ya existia una solicitud de suscripcion sin
-- resolver (status no cancelado/rechazado/vencido), se devolvia TAL CUAL
-- estaba -- ignorando por completo el plan que el usuario acababa de
-- elegir en /cuenta. Como el estado de esa solicitud queda "approved" para
-- siempre despues del primer cobro (nada la vuelve a poner en otro estado
-- solo porque el periodo vencio -- eso solo pasa cuando llega un cobro/
-- webhook nuevo), un organizador con el servicio vencido que elegia OTRO
-- plan al reactivar terminaba viendo el checkout de Mercado Pago generado
-- con el plan y el precio VIEJOS: se le cobraba y activaba el plan de
-- antes, no el que habia elegido.
--
-- Fix: si la solicitud existente ya es del plan pedido, se sigue
-- devolviendo tal cual (evita duplicar la solicitud en un reintento
-- normal). Si es de OTRO plan, se actualiza a los datos del plan nuevo
-- antes de devolverla -- asi el checkout que se genera despues de esto
-- siempre corresponde al plan que el usuario realmente eligio.
begin;

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
    if s.plan_id = p_plan_id then
      return to_jsonb(s);
    end if;
    select * into p from public.subscription_plans where id = p_plan_id and active;
    if not found or p.price_minor <= 0 then raise exception 'El plan no está disponible.'; end if;
    update public.subscription_signups set
      plan_id = p.id,
      expected_amount = p.price_minor,
      expected_currency = p.currency,
      frequency_months = case p.billing_interval when 'yearly' then 12 else 1 end,
      updated_at = now()
    where id = s.id
    returning * into s;
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

commit;

notify pgrst, 'reload schema';
