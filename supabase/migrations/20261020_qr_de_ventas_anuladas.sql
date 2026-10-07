-- Auditoria de ventas con QR (2026-10-06).
--
-- 1. cancel_table_sale cancelaba la venta de una mesa y liberaba la mesa,
--    pero NO anulaba la entrada (QR) que sell_table le genera desde
--    20261012: el comprador cancelado seguia entrando con su QR, y si la
--    mesa se volvia a vender habia dos QR validos para la misma mesa.
--    Ahora anula las entradas sin usar de esa venta.
--
-- 2. confirm_online_sale, con una mesa online pagada tarde que ya habia
--    tomado otra persona: el trigger cp_sale_table_sync deja la venta
--    'cancelled', pero la funcion igual le creaba la entrada de mesa
--    'issued' (un QR valido para una venta cancelada). Ahora solo la crea
--    si la venta quedo realmente confirmada.
--
-- 3. validate_ticket_manual (puerta, QR y codigo manual) solo miraba el
--    estado de la ENTRADA. Defensa en profundidad: si la VENTA no esta
--    confirmada (cancelada/reembolsada), la entrada se trata como anulada
--    aunque por algun camino haya quedado 'issued'.
--
-- 4. Algunos mensajes de error en produccion tenian los acentos rotos
--    ("El evento no estÃ¡ habilitado...") porque una migracion se pego con
--    la codificacion equivocada. Se corrigen en todas las funciones.
--
-- 5. Reparacion de datos: entradas sin usar de ventas no confirmadas
--    pasan a anuladas (al 2026-10-06 no habia ninguna).
--
-- Los cambios se aplican sobre la definicion VIVA de cada funcion (con
-- reemplazos puntuales que fallan si no encuentran el texto esperado), para
-- no pisar por accidente una version mas nueva que la del repo.
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

-- 1. Cancelar una mesa anula su QR.
select pg_temp.cp_patch(
  'public.cancel_table_sale(uuid, text)',
  $old$update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;$old$,
  $new$update public.sales set status = 'cancelled', updated_at = now() where id = p_sale_id;

  -- La entrada (QR) de la mesa deja de servir para entrar.
  update public.tickets set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where sale_id = p_sale_id and status = 'issued';$new$
);

-- 2. Mesa online pagada tarde y ya tomada: sin entrada.
select pg_temp.cp_patch(
  'public.confirm_online_sale(uuid, text)',
  $old$if v_sale.table_id is not null then$old$,
  $new$if v_sale.table_id is not null
     and exists (select 1 from public.sales where id = p_sale_id and status = 'confirmed') then$new$
);

-- 3. La puerta rechaza entradas de ventas no confirmadas.
select pg_temp.cp_patch(
  'public.validate_ticket_manual(uuid, text, text)',
  $old$if v_ticket_status = 'cancelled' then$old$,
  $new$-- Venta cancelada o reembolsada: la entrada no sirve aunque haya
  -- quedado 'issued' por algun camino.
  if v_ticket_status = 'issued' and exists (
    select 1 from public.tickets t2
    join public.sales s2 on s2.id = t2.sale_id
    where t2.id = v_ticket_id and s2.status <> 'confirmed'
  ) then
    v_ticket_status := 'cancelled';
  end if;

  if v_ticket_status = 'cancelled' then$new$
);

-- 4. Acentos rotos (UTF-8 leido como Latin-1) en cualquier funcion.
do $$
declare
  r record;
  v_def text;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    -- CASE para no llamar pg_get_functiondef sobre agregados (falla).
    where n.nspname = 'public'
      and (case when p.prokind = 'f' then pg_get_functiondef(p.oid) end) like '%' || chr(195) || '%'
  loop
    v_def := pg_get_functiondef(r.fn);
    v_def := replace(v_def, chr(195) || chr(161), chr(225)); -- á
    v_def := replace(v_def, chr(195) || chr(169), chr(233)); -- é
    v_def := replace(v_def, chr(195) || chr(173), chr(237)); -- í
    v_def := replace(v_def, chr(195) || chr(179), chr(243)); -- ó
    v_def := replace(v_def, chr(195) || chr(186), chr(250)); -- ú
    v_def := replace(v_def, chr(195) || chr(177), chr(241)); -- ñ
    v_def := replace(v_def, chr(194) || chr(191), chr(191)); -- ¿
    v_def := replace(v_def, chr(194) || chr(161), chr(161)); -- ¡
    execute v_def;
  end loop;
end;
$$;

-- 5. Reparacion de datos.
update public.tickets t set status = 'cancelled', cancelled_at = now(), updated_at = now()
from public.sales s
where s.id = t.sale_id and t.status = 'issued' and s.status <> 'confirmed';

commit;

notify pgrst, 'reload schema';
