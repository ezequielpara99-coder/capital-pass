-- Sistema de traslados: cada RRPP puede armar su propio colectivo para un
-- evento (transfer_routes) y sumarle pasajeros de sus propias ventas
-- (transfer_tickets), con codigo/QR propio para el embarque. El organizador
-- tambien puede tener un colectivo "general" (organization_member_id null).
-- No es dinero que pase por Mercado Pago: si el colectivo es pago, el RRPP
-- lo cobra el mismo en el momento junto con la entrada (igual que ya cobra
-- efectivo/transferencia por la entrada) -- no se mezcla con sales.total_minor.
begin;

create table if not exists public.transfer_routes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  organization_member_id uuid references public.organization_members(id) on delete set null,
  name text not null,
  departure_at timestamptz,
  departure_location text,
  capacity integer check (capacity is null or capacity > 0),
  is_paid boolean not null default false,
  price_minor bigint not null default 0 check (price_minor >= 0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists transfer_routes_event_idx on public.transfer_routes (event_id);
create index if not exists transfer_routes_member_idx on public.transfer_routes (organization_member_id);

create table if not exists public.transfer_tickets (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.transfer_routes(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  passenger_name text not null,
  passenger_phone text,
  manual_code text not null,
  status text not null default 'issued' check (status in ('issued', 'used', 'cancelled')),
  used_at timestamptz,
  used_by uuid references public.organization_members(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists transfer_tickets_manual_code_uq on public.transfer_tickets (route_id, manual_code);
create unique index if not exists transfer_tickets_sale_route_uq on public.transfer_tickets (sale_id, route_id) where sale_id is not null;
create index if not exists transfer_tickets_route_idx on public.transfer_tickets (route_id);

alter table public.transfer_routes enable row level security;
alter table public.transfer_tickets enable row level security;
revoke all on public.transfer_routes from anon, authenticated;
revoke all on public.transfer_tickets from anon, authenticated;
grant all on public.transfer_routes to service_role;
grant all on public.transfer_tickets to service_role;

-- Suma un pasajero a un colectivo (el RRPP dueño, o el organizador). Respeta
-- el cupo si se cargo uno. Si sale_id ya tiene un pasaje para esta misma
-- ruta (reintento de red del mismo click), devuelve el que ya existia en
-- vez de duplicarlo.
create or replace function public.assign_transfer_ticket(
  p_route_id uuid,
  p_passenger_name text,
  p_passenger_phone text default null,
  p_sale_id uuid default null
)
returns table(transfer_ticket_id uuid, manual_code text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_route record;
  v_actor_member_id uuid;
  v_count integer;
  v_code text;
  v_id uuid;
  v_existing record;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  select * into v_route from public.transfer_routes where id = p_route_id;
  if not found then raise exception 'El colectivo no existe.'; end if;
  if not v_route.active then raise exception 'Este colectivo esta desactivado.'; end if;

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

  if p_sale_id is not null then
    select id, manual_code into v_existing from public.transfer_tickets
    where sale_id = p_sale_id and route_id = p_route_id;
    if found then
      return query select v_existing.id, v_existing.manual_code;
      return;
    end if;
  end if;

  if v_route.capacity is not null then
    select count(*) into v_count from public.transfer_tickets
    where route_id = p_route_id and status <> 'cancelled';
    if v_count >= v_route.capacity then
      raise exception 'El colectivo ya esta completo.';
    end if;
  end if;

  if trim(coalesce(p_passenger_name, '')) = '' then
    raise exception 'Falta el nombre del pasajero.';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.transfer_tickets(route_id, sale_id, passenger_name, passenger_phone, manual_code, created_by)
  values (p_route_id, p_sale_id, trim(p_passenger_name), nullif(trim(coalesce(p_passenger_phone, '')), ''), v_code, auth.uid())
  returning id into v_id;

  return query select v_id, v_code;
end;
$function$;

-- Valida/marca usado un pasaje de colectivo. Mismo patron que
-- validate_ticket_manual: lock de fila, clasifica invalid/cancelled/
-- already_used/valid.
create or replace function public.validate_transfer_ticket(
  p_route_id uuid,
  p_manual_code text
)
returns table(result text, transfer_ticket_id uuid, passenger_name text, validated_at timestamptz)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_route record;
  v_actor_member_id uuid;
  v_code text;
  v_ticket_id uuid;
  v_status text;
  v_used_at timestamptz;
  v_passenger text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  select * into v_route from public.transfer_routes where id = p_route_id;
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

  v_code := upper(btrim(p_manual_code));
  if v_code = '' then
    raise exception 'Ingresa el codigo del pasajero.';
  end if;

  select t.id, t.status, t.used_at, t.passenger_name
  into v_ticket_id, v_status, v_used_at, v_passenger
  from public.transfer_tickets t
  where t.route_id = p_route_id and upper(t.manual_code) = v_code
  for update of t;

  if not found then
    return query select 'invalid'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if v_status = 'cancelled' then
    return query select 'cancelled'::text, v_ticket_id, v_passenger, v_used_at;
    return;
  end if;

  if v_status = 'used' then
    return query select 'already_used'::text, v_ticket_id, v_passenger, v_used_at;
    return;
  end if;

  update public.transfer_tickets
  set status = 'used', used_at = now(), used_by = v_actor_member_id
  where id = v_ticket_id;

  return query select 'valid'::text, v_ticket_id, v_passenger, now();
end;
$function$;

grant execute on function public.assign_transfer_ticket(uuid, text, text, uuid) to authenticated;
grant execute on function public.validate_transfer_ticket(uuid, text) to authenticated;

commit;

notify pgrst, 'reload schema';
