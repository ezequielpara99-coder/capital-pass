-- confirm_online_sale validaba el cupo de cada sale_item por separado
-- contra el mismo conteo de "vendidas", sin sumar entre si las lineas de
-- la MISMA tanda dentro de una misma venta (ej. entradas sueltas + un pack
-- que resuelve a la misma tanda, algo que la UI de compra permite armar en
-- un solo carrito). Si dos sale_items de una venta compartian
-- ticket_type_id, cada uno "pasaba" el chequeo por separado aunque juntos
-- superaran el cupo real -- se disparaba sobre todo con un pago
-- aprobado tarde (despues de que el cron de 30 minutos ya habia cancelado
-- la reserva) reviviendo una venta cuyo cupo ya se lo habian llevado otros
-- compradores mientras tanto.
--
-- El fix agrupa las sale_items de la venta por ticket_type_id ANTES de
-- comparar contra el cupo, para que la suma de todas las lineas de una
-- misma tanda en este carrito se valide de una sola vez.
begin;

create or replace function public.confirm_online_sale(p_sale_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_sale public.sales%rowtype;
  v_item record;
  v_sold integer;
  v_capacity integer;
begin
  select * into v_sale from public.sales where id = p_sale_id and channel = 'online' for update;
  if not found then
    raise exception 'Venta online inexistente';
  end if;

  -- Idempotente: un reintento del webhook no debe duplicar entradas ni
  -- volver a procesar una venta ya confirmada. Pero si lo que llega ahora
  -- es un reembolso/contracargo sobre esta MISMA venta ya confirmada, hay
  -- que anular las entradas en vez de ignorarlo.
  if v_sale.status = 'confirmed' then
    if p_status not in ('approved', 'pending', 'in_process', 'in_mediation', 'authorized') then
      update public.tickets set status = 'cancelled', cancelled_at = now(), updated_at = now()
      where sale_id = p_sale_id and status = 'issued';

      update public.sales set status = 'refunded', updated_at = now() where id = p_sale_id;

      for v_item in select distinct ticket_type_id from public.sale_items where sale_id = p_sale_id loop
        select capacity into v_capacity from public.ticket_types where id = v_item.ticket_type_id for update;
        select count(*)::integer into v_sold from public.tickets t
        where t.ticket_type_id = v_item.ticket_type_id and t.status <> 'cancelled';
        if v_sold < v_capacity then
          update public.ticket_types set status = 'available', updated_at = now()
          where id = v_item.ticket_type_id and status = 'sold_out';
        end if;
      end loop;
    end if;
    return;
  end if;

  -- Se procesa desde 'pending_approval' (caso normal) o 'cancelled' (el
  -- cron de 30 minutos ya la habia vencido, pero el pago aprobado llego
  -- despues -- tipico de un pago en efectivo). Cualquier otro estado no
  -- se toca.
  if v_sale.status not in ('pending_approval', 'cancelled') then
    return;
  end if;

  if p_status in ('pending', 'in_process', 'in_mediation', 'authorized') then
    -- Todavia no hay una decision final. No tocamos la venta -- ni
    -- siquiera si ya estaba 'cancelled' por el cron, para no revivirla
    -- con un estado que todavia no es definitivo.
    return;
  end if;

  if p_status <> 'approved' then
    if v_sale.status = 'pending_approval' then
      update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;
    end if;
    return;
  end if;

  -- Pago aprobado: re-verificamos cupo con lock por cada TANDA distinta
  -- del carrito (agrupando sale_items que comparten ticket_type_id, para
  -- no subestimar cuanto pide esta venta) antes de confirmar nada -- tanto
  -- en el camino normal como al revivir una venta que el cron ya habia
  -- cancelado. El lock se toma ANTES de contar cuantas entradas ya hay
  -- vendidas: si no, dos confirmaciones simultaneas para la misma tanda
  -- pueden leer las dos el mismo conteo desactualizado mientras esperan
  -- el lock, y sobrevender.
  for v_item in
    select ticket_type_id, sum(quantity)::integer as total_quantity
    from public.sale_items
    where sale_id = p_sale_id
    group by ticket_type_id
  loop
    select capacity into v_capacity from public.ticket_types where id = v_item.ticket_type_id for update;

    select count(*)::integer into v_sold from public.tickets t
    where t.ticket_type_id = v_item.ticket_type_id and t.status <> 'cancelled';

    if v_sold + v_item.total_quantity > v_capacity then
      update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;
      raise warning 'confirm_online_sale: pago aprobado sin cupo disponible, venta % quedo cancelada -- requiere reintegro manual', p_sale_id;
      return;
    end if;
  end loop;

  update public.sales set status = 'confirmed', confirmed_at = now(), updated_at = now() where id = p_sale_id;

  for v_item in select * from public.sale_items where sale_id = p_sale_id loop
    insert into public.tickets (sale_item_id, sale_id, event_id, ticket_type_id, status, combo_type, combo_event_product_id, combo_remaining_quantity, combo_remaining_credit_minor)
    select v_item.id, p_sale_id, v_item.event_id, v_item.ticket_type_id, 'issued', v_item.combo_type, v_item.combo_event_product_id, v_item.combo_quantity, v_item.combo_credit_minor
    from generate_series(1, v_item.quantity);

    select count(*)::integer into v_sold from public.tickets t
    where t.ticket_type_id = v_item.ticket_type_id and t.status <> 'cancelled';

    select capacity into v_capacity from public.ticket_types where id = v_item.ticket_type_id;

    if v_sold >= v_capacity then
      update public.ticket_types set status = 'sold_out', updated_at = now() where id = v_item.ticket_type_id;
    end if;
  end loop;
end;
$$;
revoke all on function public.confirm_online_sale(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_online_sale(uuid, text) to service_role;

commit;

notify pgrst, 'reload schema';
