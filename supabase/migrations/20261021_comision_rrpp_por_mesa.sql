-- Decision de Eze (2026-10-06): un RRPP que vende una mesa tambien cobra
-- comision por esa venta, igual que por las entradas.
--
-- sell_table ahora congela el % de comision del RRPP en la venta
-- (commission_percentage_snapshot), igual que create_sale para el canal
-- 'rrpp'. Si vende el organizador, queda null y no genera comision.
-- Al 2026-10-06 no habia ninguna mesa vendida por un RRPP, asi que no hay
-- ventas viejas que pasen a generar comision de golpe.
--
-- Parche sobre la definicion VIVA (ver 20261020): falla si no encuentra el
-- texto esperado.
begin;

create or replace function pg_temp.cp_patch(p_fn regprocedure, p_old text, p_new text)
returns void language plpgsql as $fn$
declare
  v_def text := pg_get_functiondef(p_fn);
begin
  if position(p_old in v_def) = 0 then
    raise exception 'cp_patch: no se encontro el texto a reemplazar en %: %', p_fn, p_old;
  end if;
  execute replace(v_def, p_old, p_new);
end;
$fn$;

select pg_temp.cp_patch(
  'public.sell_table(uuid, uuid, text, text, text, text, text, uuid)',
  $old$insert into public.sales (organization_id, event_id, buyer_id, seller_member_id, status, total_minor, currency, channel, payment_method, table_id, confirmed_at, idempotency_key)$old$,
  $new$insert into public.sales (organization_id, event_id, buyer_id, seller_member_id, status, total_minor, currency, channel, payment_method, table_id, confirmed_at, idempotency_key, commission_percentage_snapshot)$new$
);

select pg_temp.cp_patch(
  'public.sell_table(uuid, uuid, text, text, text, text, text, uuid)',
  $old$'mesa', v_payment_method, p_table_id, now(), p_idempotency_key)$old$,
  $new$'mesa', v_payment_method, p_table_id, now(), p_idempotency_key,
      -- % de comision del RRPP que vende, congelado al momento de la venta.
      case when v_seller_role = 'rrpp' then (
        select es.commission_percentage from public.event_staff es
        where es.event_id = p_event_id and es.organization_member_id = v_seller_member_id
          and es.staff_role = 'rrpp' and es.active = true
        limit 1
      ) end)$new$
);

commit;

notify pgrst, 'reload schema';
