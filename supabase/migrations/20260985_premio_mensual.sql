-- Premio mensual del ranking: el organizador define hasta 3 premios (puestos
-- 1, 2 y 3). Cuando termina el mes, un cron diario cierra el ranking y guarda
-- a los ganadores en member_monthly_winners (idempotente: una fila por
-- boliche + mes + puesto, el cron puede correr todos los dias sin duplicar).
-- El desempate es de quien llego primero a ese puntaje: si dos socios
-- terminan con los mismos puntos, gana el que los alcanzo antes. El mismo
-- desempate se usa en el ranking que ve el socio, asi lo que ve es lo que gana.
begin;

alter table public.organizations add column if not exists member_prize_1 text check (member_prize_1 is null or length(member_prize_1) <= 120);
alter table public.organizations add column if not exists member_prize_2 text check (member_prize_2 is null or length(member_prize_2) <= 120);
alter table public.organizations add column if not exists member_prize_3 text check (member_prize_3 is null or length(member_prize_3) <= 120);

create table if not exists public.member_monthly_winners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.premium_members(id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  position integer not null check (position between 1 and 3),
  points integer not null,
  prize text not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, period, position)
);
create index if not exists member_monthly_winners_member_idx on public.member_monthly_winners (member_id, created_at desc);
create index if not exists member_monthly_winners_org_idx on public.member_monthly_winners (organization_id, period desc);

alter table public.member_monthly_winners enable row level security;
revoke all on public.member_monthly_winners from anon, authenticated;
grant all on public.member_monthly_winners to service_role;

-- Ranking del socio: mismo calculo que antes pero con desempate (row_number)
-- y devolviendo los premios configurados.
create or replace function public.member_ranking(p_member_id uuid, p_since timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org_id uuid;
  v_enabled boolean;
  v_prizes jsonb;
  v_result jsonb;
begin
  select organization_id into v_org_id from public.premium_members where id = p_member_id and deleted_at is null;
  if v_org_id is null then
    return jsonb_build_object('enabled', false, 'top', '[]'::jsonb, 'me', null, 'participants', 0, 'prizes', '[]'::jsonb);
  end if;

  select member_ranking_enabled,
    (select coalesce(jsonb_agg(jsonb_build_object('position', p.position, 'prize', p.prize) order by p.position), '[]'::jsonb)
     from (values (1, member_prize_1), (2, member_prize_2), (3, member_prize_3)) as p(position, prize)
     where p.prize is not null)
  into v_enabled, v_prizes
  from public.organizations where id = v_org_id;

  if not coalesce(v_enabled, true) then
    return jsonb_build_object('enabled', false, 'top', '[]'::jsonb, 'me', null, 'participants', 0, 'prizes', '[]'::jsonb);
  end if;

  with earned as (
    select m.id, m.first_name, m.last_name, sum(t.delta)::int as points, max(t.created_at) as last_at
    from public.member_points_transactions t
    join public.premium_members m on m.id = t.member_id
    where m.organization_id = v_org_id and m.deleted_at is null and m.status = 'active'
      and t.delta > 0 and t.reason not like 'Reembolso%' and t.created_at >= p_since
    group by m.id
  ), ranked as (
    select id, first_name, last_name, points, row_number() over (order by points desc, last_at asc, id)::int as position
    from earned
  )
  select jsonb_build_object(
    'enabled', true,
    'participants', (select count(*)::int from ranked),
    'prizes', v_prizes,
    'top', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'position', r.position,
        'name', r.first_name || ' ' || left(r.last_name, 1) || '.',
        'points', r.points,
        'isMe', r.id = p_member_id
      ) order by r.position), '[]'::jsonb)
      from (select * from ranked order by position limit 10) r
    ),
    'me', (select jsonb_build_object('position', r.position, 'points', r.points) from ranked r where r.id = p_member_id)
  ) into v_result;

  return v_result;
end;
$function$;

-- Cierra un mes para un boliche: guarda a los ganadores de los puestos que
-- tengan premio. Devuelve cuantos ganadores nuevos registro (0 si ya estaba
-- cerrado o no hay premios/puntos).
create or replace function public.member_close_month(p_organization_id uuid, p_period text, p_from timestamptz, p_to timestamptz)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_enabled boolean;
  v_p1 text;
  v_p2 text;
  v_p3 text;
  v_inserted integer;
begin
  select member_ranking_enabled, member_prize_1, member_prize_2, member_prize_3
  into v_enabled, v_p1, v_p2, v_p3
  from public.organizations where id = p_organization_id;

  if not found or not coalesce(v_enabled, true) or (v_p1 is null and v_p2 is null and v_p3 is null) then
    return 0;
  end if;

  insert into public.member_monthly_winners (organization_id, member_id, period, position, points, prize)
  select p_organization_id, r.id, p_period, r.position, r.points,
    case r.position when 1 then v_p1 when 2 then v_p2 else v_p3 end
  from (
    select e.id, e.points, row_number() over (order by e.points desc, e.last_at asc, e.id)::int as position
    from (
      select m.id, sum(t.delta)::int as points, max(t.created_at) as last_at
      from public.member_points_transactions t
      join public.premium_members m on m.id = t.member_id
      where m.organization_id = p_organization_id and m.deleted_at is null and m.status = 'active'
        and t.delta > 0 and t.reason not like 'Reembolso%' and t.created_at >= p_from and t.created_at < p_to
      group by m.id
    ) e
  ) r
  where r.position <= 3
    and case r.position when 1 then v_p1 when 2 then v_p2 else v_p3 end is not null
  on conflict (organization_id, period, position) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

revoke all on function public.member_close_month(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.member_close_month(uuid, text, timestamptz, timestamptz) to service_role;

commit;

notify pgrst, 'reload schema';
