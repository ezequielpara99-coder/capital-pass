-- Auditoria de membresia (app del socio). Bugs que arregla:
--
-- 1. CRITICO: una mesa reservada desde la app del socio para un evento de
--    otro dia se cancelaba sola a las 6 horas (cp_expire_stale_member_orders
--    trataba igual un pedido de barra que una reserva de mesa): la mesa
--    volvia a quedar disponible para otro y el socio llegaba sin mesa. Ahora
--    una reserva de mesa a pagar en el lugar solo se cancela sola cuando el
--    evento ya termino o se cancelo, y una mesa ya pagada con saldo nunca se
--    cancela sola (la plata ya se cobro y la venta ya esta confirmada: lo
--    resuelve el organizador).
--
-- 2. Recarga pagada dos veces: si el socio pagaba dos veces el mismo link de
--    Mercado Pago (dos pestañas, doble toque), el segundo pago aprobado no se
--    acreditaba nunca -- la plata quedaba cobrada sin saldo. Ahora cada pago
--    aprobado distinto se acredita en su propia fila de wallet_topups
--    (mp_payment_id sigue siendo unico: un mismo pago nunca se acredita dos
--    veces).
--
-- 3. Un reembolso se aplicaba a la recarga sin mirar de que pago era: el
--    reembolso de un pago repetido podia descontar el saldo de la recarga
--    original. Ahora el reembolso se aplica solo a la fila de ESE pago.
begin;

-- Ya la agrega 20261014; se repite por si esa no se corrio todavia (la
-- funcion de abajo la copia en las recargas repetidas).
alter table public.wallet_topups add column if not exists mercadopago_collector_id bigint;

create or replace function public.member_wallet_topup_apply(p_topup_id uuid, p_payment_id text, p_status text)
returns table(applied boolean, new_status text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_topup public.wallet_topups%rowtype;
  v_other public.wallet_topups%rowtype;
  v_target text;
  v_balance bigint;
  v_debit bigint;
  v_extra_id uuid;
begin
  select * into v_topup from public.wallet_topups where id = p_topup_id for update;
  if not found then
    raise exception 'La recarga no existe.';
  end if;

  v_target := case
    when p_status = 'approved' then 'approved'
    when p_status in ('refunded', 'charged_back') then 'refunded'
    when p_status in ('rejected', 'cancelled') then 'rejected'
    else 'pending'
  end;

  if v_target = 'pending' then
    return query select false, v_topup.status;
    return;
  end if;

  -- Un pago que ya quedo registrado en otra fila (un pago repetido del
  -- mismo link, ver abajo) se procesa sobre esa fila.
  if p_payment_id is not null and v_topup.mp_payment_id is distinct from p_payment_id then
    select * into v_other from public.wallet_topups where mp_payment_id = p_payment_id for update;
    if found then
      if v_other.member_id <> v_topup.member_id then
        raise exception 'El pago pertenece a otra recarga.';
      end if;
      v_topup := v_other;
    end if;
  end if;

  -- Un intento rechazado puede reintentarse con la misma preferencia y
  -- terminar aprobado, por eso 'rejected' tambien puede pasar a 'approved'.
  if v_target = 'approved' and v_topup.status in ('pending', 'rejected') then
    update public.premium_members set balance_minor = balance_minor + v_topup.amount_minor, updated_at = now()
    where id = v_topup.member_id;

    insert into public.wallet_transactions (member_id, amount_minor, kind, note)
    values (v_topup.member_id, v_topup.amount_minor, 'topup', 'Recarga con Mercado Pago');

    update public.wallet_topups set status = 'approved', mp_payment_id = p_payment_id, approved_at = now() where id = v_topup.id;
    return query select true, 'approved'::text;
    return;
  end if;

  -- Pago repetido del mismo link: la recarga ya se acredito con OTRO pago.
  -- Este tambien se cobro, asi que tambien se acredita, en una fila propia.
  if v_target = 'approved' and v_topup.status in ('approved', 'refunded')
    and v_topup.mp_payment_id is distinct from p_payment_id and p_payment_id is not null then
    insert into public.wallet_topups (organization_id, member_id, amount_minor, status, mp_payment_id, approved_at, mercadopago_collector_id)
    values (v_topup.organization_id, v_topup.member_id, v_topup.amount_minor, 'approved', p_payment_id, now(), v_topup.mercadopago_collector_id)
    on conflict (mp_payment_id) where mp_payment_id is not null do nothing
    returning id into v_extra_id;

    if v_extra_id is null then
      return query select false, 'approved'::text;
      return;
    end if;

    update public.premium_members set balance_minor = balance_minor + v_topup.amount_minor, updated_at = now()
    where id = v_topup.member_id;
    insert into public.wallet_transactions (member_id, amount_minor, kind, note)
    values (v_topup.member_id, v_topup.amount_minor, 'topup', 'Recarga con Mercado Pago (pago repetido)');
    return query select true, 'approved'::text;
    return;
  end if;

  if v_target = 'rejected' and v_topup.status = 'pending' then
    update public.wallet_topups set status = 'rejected' where id = v_topup.id;
    return query select false, 'rejected'::text;
    return;
  end if;

  -- Pago devuelto despues de acreditar: solo si es el pago de ESTA fila. Se
  -- descuenta lo que todavia quede (no se puede quitar lo que el socio ya
  -- consumio).
  if v_target = 'refunded' and v_topup.status = 'approved' and v_topup.mp_payment_id is not distinct from p_payment_id then
    select balance_minor into v_balance from public.premium_members where id = v_topup.member_id for update;
    v_debit := least(coalesce(v_balance, 0), v_topup.amount_minor);
    if v_debit > 0 then
      update public.premium_members set balance_minor = balance_minor - v_debit, updated_at = now() where id = v_topup.member_id;
      insert into public.wallet_transactions (member_id, amount_minor, kind, note)
      values (v_topup.member_id, -v_debit, 'adjustment', 'Recarga reembolsada por Mercado Pago');
    end if;
    update public.wallet_topups set status = 'refunded' where id = v_topup.id;
    return query select true, 'refunded'::text;
    return;
  end if;

  return query select false, v_topup.status;
end;
$function$;

revoke all on function public.member_wallet_topup_apply(uuid, text, text) from public, anon, authenticated;
grant execute on function public.member_wallet_topup_apply(uuid, text, text) to service_role;

create or replace function public.cp_expire_stale_member_orders(p_hours integer default 6)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select o.id, o.organization_id
    from public.member_orders o
    left join public.events e on e.id = o.event_id
    where o.status = 'pending'
      and (
        -- Pedido de barra: si nadie lo atendio en p_hours horas, se cancela.
        (o.kind = 'consumo' and o.created_at < now() - (greatest(p_hours, 1) || ' hours')::interval)
        -- Reserva de mesa a pagar en el lugar: recien cuando el evento ya
        -- paso (o se cancelo). Antes de eso es una reserva valida aunque se
        -- haya hecho dias antes.
        or (o.kind = 'mesa' and o.payment = 'en_barra' and (
          e.id is null
          or e.status in ('finished', 'cancelled')
          or coalesce(e.ends_at, e.starts_at + interval '12 hours', o.created_at + interval '7 days') < now()
        ))
        -- Mesa pagada con saldo: nunca se cancela sola.
      )
    order by o.created_at asc
    limit 200
  loop
    begin
      perform public.member_order_set_status(v_row.id, 'cancelled', v_row.organization_id, null);
      v_count := v_count + 1;
    exception when others then
      -- Un pedido puntual que falle (carrera con el bartender marcandolo en
      -- paralelo, por ejemplo) no tiene que frenar la limpieza del resto.
      null;
    end;
  end loop;
  return v_count;
end;
$function$;

revoke all on function public.cp_expire_stale_member_orders(integer) from public, anon, authenticated;
grant execute on function public.cp_expire_stale_member_orders(integer) to service_role;

commit;

notify pgrst, 'reload schema';
