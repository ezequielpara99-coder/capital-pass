-- Bug real encontrado en revision: la migracion 20260919 ya arreglo que
-- confirm_online_sale no cancele una venta ante un aviso 'pending'/
-- 'in_process' (pago en efectivo recien iniciado). Pero el cron de 30
-- minutos (cp_cancel_stale_online_sales) no sabe nada de eso: cancela
-- CUALQUIER venta que siga en 'pending_approval' pasados los 30 minutos,
-- sin importar si Mercado Pago todavia la tiene "en curso" (tipico de un
-- pago en efectivo tipo Pago Facil/Rapipago, que puede tardar horas). Si
-- el aviso final de 'approved' llega despues de que el cron ya cancelo la
-- venta, confirm_online_sale la encontraba 'cancelled' (no
-- 'pending_approval') y no hacia nada -- el comprador pagaba y no recibia
-- ninguna entrada, sin ningun aviso.
--
-- De paso, tampoco habia un re-chequeo de cupo al momento de emitir las
-- entradas -- solo al crear el carrito. Si dos compradores terminaban
-- pagando el mismo cupo (uno de ellos con un carrito que el cron ya habia
-- "liberado" al pasar los 30 minutos), se podian emitir mas entradas que
-- la capacidad de la tanda.
--
-- Este fix hace dos cosas: revive una venta cancelada por el cron si el
-- pago llega aprobado y todavia hay cupo (en vez de perder la venta), y
-- re-verifica el cupo con un lock justo antes de emitir las entradas (en
-- vez de solo al crear el carrito), cerrando la ventana de sobreventa.
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
  -- volver a procesar una venta ya confirmada.
  if v_sale.status = 'confirmed' then
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

  -- Pago aprobado: re-verificamos cupo con lock por cada tanda del
  -- carrito antes de confirmar nada -- tanto en el camino normal como al
  -- revivir una venta que el cron ya habia cancelado. Si alguna tanda ya
  -- no tiene lugar, la venta queda (o se mantiene) cancelada en vez de
  -- sobrevender, y queda un aviso en los logs para detectarla y
  -- reintegrar manualmente al comprador.
  for v_item in select * from public.sale_items where sale_id = p_sale_id loop
    select count(*)::integer into v_sold from public.tickets t
    where t.ticket_type_id = v_item.ticket_type_id and t.status <> 'cancelled';

    select capacity into v_capacity from public.ticket_types where id = v_item.ticket_type_id for update;

    if v_sold + v_item.quantity > v_capacity then
      update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;
      raise warning 'confirm_online_sale: pago aprobado sin cupo disponible, venta % quedo cancelada -- requiere reintegro manual', p_sale_id;
      return;
    end if;
  end loop;

  update public.sales set status = 'confirmed', confirmed_at = now(), updated_at = now() where id = p_sale_id;

  for v_item in select * from public.sale_items where sale_id = p_sale_id loop
    insert into public.tickets (sale_item_id, sale_id, event_id, ticket_type_id, status)
    select v_item.id, p_sale_id, v_item.event_id, v_item.ticket_type_id, 'issued'
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
