-- sell_table (venta/reserva de mesa) era la unica de las 3 formas de
-- vender en persona (create_sale, create_bartender_sale/redeem_combo_ticket,
-- sell_table) sin ningun mecanismo de idempotencia. Con la wifi tipica de
-- un evento, si la respuesta se perdia despues de que el servidor ya habia
-- reservado y cobrado la mesa, el RRPP/organizador reintentaba creyendo
-- que habia fallado -- el segundo intento chocaba con "Esa mesa ya no
-- esta disponible" sin ninguna forma de recuperar el recibo de la venta
-- que en realidad SI se habia concretado.
--
-- sales.idempotency_key ya existe (con su indice UNIQUE, de la
-- idempotencia de create_sale) -- sell_table inserta en esa misma tabla,
-- asi que solo hace falta agregarle el mismo parametro y el mismo chequeo.
begin;

create or replace function public.sell_table(
  p_event_id uuid, p_table_id uuid,
  p_buyer_first_name text, p_buyer_last_name text, p_buyer_dni text, p_buyer_phone text,
  p_payment_method text,
  p_idempotency_key uuid default null
)
returns table(sale_id uuid, total_minor bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_organization_id uuid;
  v_seller_member_id uuid;
  v_seller_role public.organization_member_role;
  v_price bigint;
  v_status text;
  v_buyer_id uuid;
  v_sale_id uuid;
  v_existing_total bigint;
  v_payment_method public.sale_payment_method;
begin
  if p_idempotency_key is not null then
    select s.id, s.total_minor into v_sale_id, v_existing_total
    from public.sales s where s.idempotency_key = p_idempotency_key;
    if found then
      return query select v_sale_id, v_existing_total;
      return;
    end if;
  end if;

  if not public.is_platform_admin() and not exists (
    select 1 from public.events e where e.id = p_event_id and public.cp_org_has_service(e.organization_id)
  ) then
    raise exception 'La organizacion necesita una suscripcion activa.';
  end if;

  begin
    v_payment_method := p_payment_method::public.sale_payment_method;
  exception when invalid_text_representation then
    raise exception 'Indica si la venta fue en efectivo o transferencia';
  end;

  if p_buyer_first_name is null or btrim(p_buyer_first_name) = '' then
    raise exception 'El nombre del comprador es obligatorio';
  end if;
  if p_buyer_last_name is null or btrim(p_buyer_last_name) = '' then
    raise exception 'El apellido del comprador es obligatorio';
  end if;
  if p_buyer_phone is null or btrim(p_buyer_phone) = '' then
    raise exception 'El WhatsApp del comprador es obligatorio';
  end if;

  select e.organization_id into v_organization_id from public.events e where e.id = p_event_id;
  if not found then
    raise exception 'El evento no existe';
  end if;

  select om.id, om.role into v_seller_member_id, v_seller_role
  from public.organization_members om
  where om.organization_id = v_organization_id and om.user_id = auth.uid() and om.status = 'active'
  limit 1;

  if v_seller_member_id is null or v_seller_role not in ('organizer', 'rrpp') then
    raise exception 'No tenes permiso para vender mesas en este evento';
  end if;

  if v_seller_role = 'rrpp' and not exists (
    select 1 from public.event_staff es
    where es.event_id = p_event_id and es.organization_member_id = v_seller_member_id
      and es.staff_role = 'rrpp' and es.active = true
  ) then
    raise exception 'No estas asignado como RRPP a este evento';
  end if;

  select price_minor, status into v_price, v_status
  from public.bar_tables where id = p_table_id and event_id = p_event_id
  for update;

  if not found then
    raise exception 'La mesa no existe para este evento';
  end if;

  if v_status <> 'available' then
    raise exception 'Esa mesa ya no esta disponible';
  end if;

  insert into public.buyers (organization_id, first_name, last_name, dni, phone)
  values (v_organization_id, btrim(p_buyer_first_name), btrim(p_buyer_last_name), nullif(btrim(coalesce(p_buyer_dni, '')), ''), btrim(p_buyer_phone))
  returning id into v_buyer_id;

  insert into public.sales (organization_id, event_id, buyer_id, seller_member_id, status, total_minor, currency, channel, payment_method, table_id, confirmed_at, idempotency_key)
  values (v_organization_id, p_event_id, v_buyer_id, v_seller_member_id, 'confirmed', coalesce(v_price, 0), 'ARS', 'mesa', v_payment_method, p_table_id, now(), p_idempotency_key)
  returning id into v_sale_id;

  update public.bar_tables set status = 'reserved' where id = p_table_id;

  return query select v_sale_id, coalesce(v_price, 0);
end;
$$;
revoke all on function public.sell_table(uuid, uuid, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.sell_table(uuid, uuid, text, text, text, text, text, uuid) to authenticated;

-- La firma vieja (sin idempotency key) queda huerfana -- se elimina para
-- que PostgREST no quede con dos funciones ambiguas del mismo nombre
-- (mismo problema que ya paso una vez con create_sale en esta sesion).
drop function if exists public.sell_table(uuid, uuid, text, text, text, text, text);

commit;

notify pgrst, 'reload schema';
