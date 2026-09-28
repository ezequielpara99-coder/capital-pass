-- Ranking de socios: tabla de posiciones por puntos GANADOS (no por saldo,
-- asi canjear un premio no te hace bajar de posicion). Cuenta lo que suman
-- los pedidos entregados y la asistencia a fiestas; deja afuera los
-- reembolsos por cancelacion (razon 'Reembolso ...') y los canjes (delta < 0).
-- Al socio solo se le muestra nombre + inicial del apellido.
begin;

-- El organizador puede apagar el ranking (default: prendido).
alter table public.organizations add column if not exists member_ranking_enabled boolean not null default true;

create index if not exists member_points_transactions_created_idx on public.member_points_transactions (created_at);

create or replace function public.member_ranking(p_member_id uuid, p_since timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org_id uuid;
  v_enabled boolean;
  v_result jsonb;
begin
  select organization_id into v_org_id from public.premium_members where id = p_member_id and deleted_at is null;
  if v_org_id is null then
    return jsonb_build_object('enabled', false, 'top', '[]'::jsonb, 'me', null, 'participants', 0);
  end if;

  select member_ranking_enabled into v_enabled from public.organizations where id = v_org_id;
  if not coalesce(v_enabled, true) then
    return jsonb_build_object('enabled', false, 'top', '[]'::jsonb, 'me', null, 'participants', 0);
  end if;

  with earned as (
    select m.id, m.first_name, m.last_name, sum(t.delta)::int as points
    from public.member_points_transactions t
    join public.premium_members m on m.id = t.member_id
    where m.organization_id = v_org_id and m.deleted_at is null and m.status = 'active'
      and t.delta > 0 and t.reason not like 'Reembolso%' and t.created_at >= p_since
    group by m.id
  ), ranked as (
    select id, first_name, last_name, points, rank() over (order by points desc)::int as position
    from earned
  )
  select jsonb_build_object(
    'enabled', true,
    'participants', (select count(*)::int from ranked),
    'top', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'position', r.position,
        'name', r.first_name || ' ' || left(r.last_name, 1) || '.',
        'points', r.points,
        'isMe', r.id = p_member_id
      ) order by r.position, r.first_name), '[]'::jsonb)
      from (select * from ranked order by position, first_name limit 10) r
    ),
    'me', (select jsonb_build_object('position', r.position, 'points', r.points) from ranked r where r.id = p_member_id)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.member_ranking(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.member_ranking(uuid, timestamptz) to service_role;

commit;

notify pgrst, 'reload schema';
