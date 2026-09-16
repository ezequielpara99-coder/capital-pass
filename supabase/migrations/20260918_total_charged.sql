-- Capital Pass: el service_role no tiene UPDATE directo sobre public.sales
-- (todas las mutaciones de ventas pasan por funciones SECURITY DEFINER, no
-- por acceso directo a la tabla). En vez de otorgar un GRANT amplio sobre
-- toda la tabla, agregamos una funcion chica y acotada solo para guardar
-- el total realmente cobrado (subtotal + cargo por servicio) de una venta
-- online, calculado en el checkout despues de crear la venta.
begin;

create or replace function public.set_online_sale_charged_total(p_sale_id uuid, p_total_charged_minor bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.sales
  set total_charged_minor = p_total_charged_minor, updated_at = now()
  where id = p_sale_id and channel = 'online' and status = 'pending_approval';

  if not found then
    raise exception 'Venta online inexistente o ya procesada';
  end if;
end;
$$;
revoke all on function public.set_online_sale_charged_total(uuid, bigint) from public, anon, authenticated;
grant execute on function public.set_online_sale_charged_total(uuid, bigint) to service_role;

commit;
