-- Mismo bug ya arreglado para ventas de entradas (20261011), encontrado en
-- esta ronda pero nunca portado a la recarga de saldo del socio premium:
-- applyTopupPayment comparaba el pago real contra la cuenta de Mercado Pago
-- VIGENTE del organizador al momento de confirmar, no contra la que
-- realmente se uso para generar la preference que vio el socio. Si el
-- organizador reconectaba/cambiaba de cuenta de Mercado Pago entre que el
-- socio abria el checkout de recarga y que el pago se confirmaba, el dinero
-- quedaba acreditado en la cuenta vieja pero la verificacion comparaba
-- contra la nueva: nunca coincidian, la recarga quedaba sin acreditar para
-- siempre (no es un error transitorio, ningun reintento del webhook lo
-- arregla), y el socio se quedaba pago y sin saldo.
--
-- A diferencia de sales/tickets, wallet_topups ya tiene GRANT ALL a
-- service_role (20260984), asi que alcanza con una columna nueva -- no
-- hace falta ninguna funcion security definer para setearla.
begin;

alter table public.wallet_topups add column if not exists mercadopago_collector_id bigint;

commit;
