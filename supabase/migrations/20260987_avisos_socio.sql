-- Avisos al celular para los socios: pedido listo, colectivo llegando, premio
-- ganado y recarga acreditada. Los socios no tienen usuario de login (entran
-- con el link firmado de su carnet), por eso tienen su propia tabla de
-- suscripciones push, separada de push_subscriptions (que es de usuarios).
begin;

create table if not exists public.member_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.premium_members(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);
create index if not exists member_push_subscriptions_member_idx on public.member_push_subscriptions (member_id);

alter table public.member_push_subscriptions enable row level security;
revoke all on public.member_push_subscriptions from anon, authenticated;
grant all on public.member_push_subscriptions to service_role;

-- Aviso del premio del ranking: se reclama de forma atomica antes de mandar,
-- asi un reintento del cron nunca avisa dos veces al mismo ganador.
alter table public.member_monthly_winners add column if not exists notified_at timestamptz;

-- Avisos del colectivo ya enviados: uno por pasaje y tipo.
create table if not exists public.transfer_notifications (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.transfer_tickets(id) on delete cascade,
  kind text not null check (kind in ('approaching', 'arrived')),
  sent_at timestamptz not null default now(),
  unique (ticket_id, kind)
);

alter table public.transfer_notifications enable row level security;
revoke all on public.transfer_notifications from anon, authenticated;
grant all on public.transfer_notifications to service_role;

-- Reclama los avisos que hay que mandar ahora para un colectivo: a cada
-- pasajero que todavia NO subio, avisa cuando el colectivo esta en la parada
-- anterior a la suya ('approaching') y cuando llega a la suya ('arrived').
-- Devuelve solo los avisos recien reclamados (una segunda llamada no devuelve
-- nada), asi el que dispara el envio nunca duplica.
create or replace function public.transfer_claim_notifications(p_route_id uuid)
returns table(
  ticket_id uuid,
  kind text,
  stop_name text,
  current_stop_name text,
  passenger_name text,
  passenger_phone text,
  sale_id uuid,
  event_id uuid
)
language plpgsql
security definer
set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_route record;
  v_cur_pos integer;
  v_cur_name text;
begin
  select * into v_route from public.transfer_routes where id = p_route_id and deleted_at is null and active = true;
  if not found or v_route.current_stop_id is null then
    return;
  end if;

  select s.position, s.name into v_cur_pos, v_cur_name from public.transfer_route_stops s where s.id = v_route.current_stop_id;
  if v_cur_pos is null then
    return;
  end if;

  return query
  with candidates as (
    select t.id as t_id, t.passenger_name as t_name, t.passenger_phone as t_phone, t.sale_id as t_sale,
      ts.name as t_stop_name,
      case when ts.position = v_cur_pos then 'arrived' else 'approaching' end as t_kind
    from public.transfer_tickets t
    join public.transfer_route_stops ts on ts.id = t.stop_id
    where t.route_id = p_route_id
      and t.status = 'issued'
      and ts.position - v_cur_pos in (0, 1)
  ), claimed as (
    insert into public.transfer_notifications (ticket_id, kind)
    select c.t_id, c.t_kind from candidates c
    on conflict (ticket_id, kind) do nothing
    returning transfer_notifications.ticket_id as c_ticket, transfer_notifications.kind as c_kind
  )
  select c.t_id, c.t_kind, c.t_stop_name, v_cur_name, c.t_name, c.t_phone, c.t_sale, v_route.event_id
  from candidates c
  join claimed k on k.c_ticket = c.t_id and k.c_kind = c.t_kind;
end;
$function$;

revoke all on function public.transfer_claim_notifications(uuid) from public, anon, authenticated;
grant execute on function public.transfer_claim_notifications(uuid) to service_role;

-- transfer_mark_stop: igual que antes, pero al reiniciar el recorrido tambien
-- se borran los avisos ya enviados (un recorrido nuevo vuelve a avisar).
create or replace function public.transfer_mark_stop(p_route_id uuid, p_stop_id uuid)
returns table(current_stop_id uuid, current_stop_at timestamptz)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_route record;
  v_actor_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  select * into v_route from public.transfer_routes where id = p_route_id and deleted_at is null for update;
  if not found then raise exception 'El colectivo no existe.'; end if;

  select om.id into v_actor_member_id
  from public.organization_members om
  join public.events e on e.organization_id = om.organization_id
  where e.id = v_route.event_id and om.user_id = auth.uid() and om.status = 'active'
  limit 1;

  if not (
    public.is_platform_admin()
    or public.is_event_organizer(v_route.event_id)
    or (v_actor_member_id is not null and v_route.organization_member_id = v_actor_member_id)
  ) then
    raise exception 'No tenes permiso sobre este colectivo.';
  end if;

  if p_stop_id is null then
    delete from public.transfer_route_arrivals where route_id = p_route_id;
    delete from public.transfer_notifications
    where ticket_id in (select t.id from public.transfer_tickets t where t.route_id = p_route_id);
    update public.transfer_routes set current_stop_id = null, current_stop_at = null where id = p_route_id;
    return query select null::uuid, null::timestamptz;
    return;
  end if;

  if not exists (select 1 from public.transfer_route_stops s where s.id = p_stop_id and s.route_id = p_route_id) then
    raise exception 'La parada no pertenece a este colectivo.';
  end if;

  update public.transfer_routes set current_stop_id = p_stop_id, current_stop_at = now() where id = p_route_id;

  insert into public.transfer_route_arrivals (route_id, stop_id, source)
  values (p_route_id, p_stop_id, 'manual')
  on conflict (route_id, stop_id) do update set arrived_at = now(), source = 'manual';

  return query select p_stop_id, now();
end;
$function$;

grant execute on function public.transfer_mark_stop(uuid, uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
