-- Dos bugs reales encontrados en una ronda de auditoria sobre el calendario
-- de rental (20260980):
--
-- 1. El chequeo de solapamiento de fechas y el insert de la reserva eran
--    dos consultas separadas sin ningun lock: dos POST casi simultaneos
--    para el MISMO equipo (doble click, o dos personas reservando la misma
--    terminal a la vez) podian pasar el chequeo juntos y reservar el mismo
--    equipo dos veces para las mismas fechas. La migracion original decidio
--    a proposito no usar un exclusion constraint (para no depender de que
--    btree_gist este habilitada) -- en cambio, se serializa con un
--    advisory lock por equipo: siempre disponible en Postgres, sin
--    depender de ninguna extension.
--
-- 2. No existia forma de EDITAR una reserva: la unica manera de "moverla"
--    de fecha era cancelarla y crear una nueva -- si el segundo paso
--    fallaba (por ejemplo porque alguien reservo ese rango en el medio),
--    la reserva original ya se habia borrado y se perdia por completo.
--    Agrega rental_update_booking(), con el mismo lock + chequeo (excluyendo
--    la propia reserva del chequeo de solapamiento), en una sola operacion
--    atomica.
begin;

create or replace function public.rental_create_booking(
  p_asset_id uuid,
  p_client_name text,
  p_starts_on date,
  p_ends_on date,
  p_quote_id uuid default null,
  p_notes text default null,
  p_created_by uuid default null
)
returns table(id uuid, asset_id uuid, quote_id uuid, client_name text, starts_on date, ends_on date, notes text, created_at timestamptz)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_clash record;
  v_id uuid;
begin
  if p_client_name is null or btrim(p_client_name) = '' then
    raise exception 'Ingresá el cliente.';
  end if;
  if p_ends_on < p_starts_on then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio.';
  end if;
  if not exists (select 1 from public.rental_assets ra where ra.id = p_asset_id) then
    raise exception 'Ese equipo no existe.';
  end if;

  -- Serializa los intentos de reservar el MISMO equipo: mientras dure esta
  -- transaccion, cualquier otra llamada (create o update) para este mismo
  -- asset_id espera aca antes de poder leer el chequeo de solapamiento de
  -- mas abajo -- cierra la ventana donde dos inserts casi simultaneos
  -- podian pasar el chequeo juntos.
  perform pg_advisory_xact_lock(hashtextextended(p_asset_id::text, 0));

  select b.client_name, b.starts_on, b.ends_on into v_clash
  from public.rental_bookings b
  where b.asset_id = p_asset_id and b.starts_on <= p_ends_on and b.ends_on >= p_starts_on
  limit 1;

  if found then
    raise exception 'Ese equipo ya está reservado para % del % al %.', v_clash.client_name, v_clash.starts_on, v_clash.ends_on;
  end if;

  insert into public.rental_bookings (asset_id, quote_id, client_name, starts_on, ends_on, notes, created_by)
  values (p_asset_id, p_quote_id, btrim(p_client_name), p_starts_on, p_ends_on, p_notes, p_created_by)
  returning rental_bookings.id into v_id;

  return query
  select rb.id, rb.asset_id, rb.quote_id, rb.client_name, rb.starts_on, rb.ends_on, rb.notes, rb.created_at
  from public.rental_bookings rb where rb.id = v_id;
end;
$function$;

revoke all on function public.rental_create_booking(uuid, text, date, date, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.rental_create_booking(uuid, text, date, date, uuid, text, uuid) to service_role;

create or replace function public.rental_update_booking(
  p_booking_id uuid,
  p_client_name text,
  p_starts_on date,
  p_ends_on date,
  p_quote_id uuid default null,
  p_notes text default null
)
returns table(id uuid, asset_id uuid, quote_id uuid, client_name text, starts_on date, ends_on date, notes text, created_at timestamptz)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_asset_id uuid;
  v_clash record;
begin
  if p_client_name is null or btrim(p_client_name) = '' then
    raise exception 'Ingresá el cliente.';
  end if;
  if p_ends_on < p_starts_on then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio.';
  end if;

  select rb.asset_id into v_asset_id from public.rental_bookings rb where rb.id = p_booking_id;
  if not found then
    raise exception 'La reserva no existe.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_asset_id::text, 0));

  select b.client_name, b.starts_on, b.ends_on into v_clash
  from public.rental_bookings b
  where b.asset_id = v_asset_id and b.id <> p_booking_id
    and b.starts_on <= p_ends_on and b.ends_on >= p_starts_on
  limit 1;

  if found then
    raise exception 'Ese equipo ya está reservado para % del % al %.', v_clash.client_name, v_clash.starts_on, v_clash.ends_on;
  end if;

  update public.rental_bookings rb
  set client_name = btrim(p_client_name), starts_on = p_starts_on, ends_on = p_ends_on,
    quote_id = p_quote_id, notes = p_notes
  where rb.id = p_booking_id;

  return query
  select rb.id, rb.asset_id, rb.quote_id, rb.client_name, rb.starts_on, rb.ends_on, rb.notes, rb.created_at
  from public.rental_bookings rb where rb.id = p_booking_id;
end;
$function$;

revoke all on function public.rental_update_booking(uuid, text, date, date, uuid, text) from public, anon, authenticated;
grant execute on function public.rental_update_booking(uuid, text, date, date, uuid, text) to service_role;

commit;

notify pgrst, 'reload schema';
