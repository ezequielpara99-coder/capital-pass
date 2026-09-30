-- Bug real encontrado en la ronda de auditoria de la suscripcion de
-- Mercado Pago del organizador: reconectar (o cambiar) la cuenta de
-- Mercado Pago de una organizacion pisa organization_mercadopago_accounts
-- (organization_id es primary key, una sola fila). applySalePayment
-- comparaba el pago real contra el mp_user_id VIGENTE en el momento de
-- confirmar, no contra el que realmente se uso para generar la
-- preference del comprador -- si el organizador reconectaba entre que el
-- comprador abria el checkout y que el pago se confirmaba, el
-- collector_id real del pago (la cuenta vieja) nunca coincidia con el
-- vigente (la cuenta nueva), verifiedPayment tiraba excepcion siempre, y
-- la venta quedaba PARA SIEMPRE sin confirmar: el comprador pagaba, el
-- dinero entraba a la cuenta vieja del organizador, y nunca se generaba
-- la entrada ni salia el mail con el QR. Ningun reintento del webhook lo
-- arreglaba porque no es un error transitorio.
--
-- Se guarda un snapshot de que cuenta MP se uso para CADA venta online,
-- en el mismo momento en que ya se guarda el total realmente cobrado
-- (mismo criterio: "la verdad de cada venta es la del momento en que se
-- genero su cobro, no la que haya despues").
begin;

alter table public.sales add column if not exists mercadopago_collector_id bigint;

-- La funcion crecio un parametro (antes (uuid, bigint), ahora (uuid,
-- bigint, bigint)): para Postgres es una funcion DISTINTA, no un
-- reemplazo -- sin este drop, la version vieja de 2 argumentos queda
-- huerfana (sin uso, pero nunca desaparece sola).
drop function if exists public.set_online_sale_charged_total(uuid, bigint);

create or replace function public.set_online_sale_charged_total(
  p_sale_id uuid, p_total_charged_minor bigint, p_mercadopago_collector_id bigint default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.sales
  set total_charged_minor = p_total_charged_minor,
      mercadopago_collector_id = coalesce(p_mercadopago_collector_id, mercadopago_collector_id),
      updated_at = now()
  where id = p_sale_id and channel = 'online' and status = 'pending_approval';

  if not found then
    raise exception 'Venta online inexistente o ya procesada';
  end if;
end;
$$;
revoke all on function public.set_online_sale_charged_total(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.set_online_sale_charged_total(uuid, bigint, bigint) to service_role;

commit;
