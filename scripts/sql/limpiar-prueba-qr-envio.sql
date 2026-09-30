-- Limpieza de los datos de prueba que usé para probar el envío de
-- entradas por WhatsApp/mail con tu celular y tu mail reales.
--
-- Qué borra: 1 organización de prueba ("Test Org Envio QR"), su evento,
-- su tanda, 3 ventas de prueba y sus entradas/QR, y la cuenta de prueba
-- que usé para vender (focusarg.ok+cpqrtest@gmail.com). Nada tuyo, nada
-- real: verificá el PASO 1 antes de seguir.
--
-- Por qué te lo tengo que pasar a vos: `sales`, `tickets` y `sale_items`
-- no se pueden borrar directo por la API (a propósito, para que ninguna
-- mutación de ventas se salte las funciones de la base) -- solo se puede
-- desde acá, con una conexión con más permisos.
--
-- COMO USARLO (Supabase -> SQL Editor):
--   1) Corré el PASO 1 (vista previa) y confirmá que sea la organización
--      "Test Org Envio QR" con 3 ventas, nada más.
--   2) Corré el PASO 2 tal cual: ENSAYO (termina en ROLLBACK, no borra nada).
--   3) Si sale bien, cambiá la última línea rollback; por commit; y corré
--      el PASO 2 de nuevo para borrar de verdad.

-- ---------------------------------------------------------------------
-- PASO 1: VISTA PREVIA
-- ---------------------------------------------------------------------
select o.id, o.name, o.slug,
       (select count(*) from public.events e where e.organization_id = o.id) as eventos,
       (select count(*) from public.sales s where s.organization_id = o.id) as ventas
from public.organizations o
where o.id = '5c316995-deb4-459b-b805-032849d5baea';
-- Tiene que salir 1 fila: "Test Org Envio QR", 1 evento, 3 ventas.


-- ---------------------------------------------------------------------
-- PASO 2: BORRADO
-- ---------------------------------------------------------------------
begin;

create or replace function pg_temp.cp_purge(p_table regclass, p_where text, p_depth integer default 0)
returns bigint
language plpgsql
as $fn$
declare
  fk record;
  child_cols text;
  parent_cols text;
  null_sets text;
  child_where text;
  n bigint;
  total bigint := 0;
begin
  if p_depth > 8 then
    raise exception 'Demasiada profundidad de dependencias en %', p_table;
  end if;

  for fk in
    select c.conrelid, c.confrelid, c.conrelid::regclass as child, c.confdeltype, c.conkey, c.confkey
    from pg_constraint c
    where c.contype = 'f' and c.confrelid = p_table
  loop
    select string_agg(format('%I', a.attname), ', ' order by k.ord),
           string_agg(format('%I = null', a.attname), ', ' order by k.ord)
      into child_cols, null_sets
    from unnest(fk.conkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = k.attnum;

    select string_agg(format('%I', a.attname), ', ' order by k.ord)
      into parent_cols
    from unnest(fk.confkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = fk.confrelid and a.attnum = k.attnum;

    child_where := format('(%s) in (select %s from %s where %s)', child_cols, parent_cols, p_table, p_where);

    if fk.confdeltype = 'n' or fk.conrelid = fk.confrelid then
      execute format('update %s set %s where %s', fk.child, null_sets, child_where);
    else
      total := total + pg_temp.cp_purge(fk.child, child_where, p_depth + 1);
    end if;
  end loop;

  execute format('delete from %s where %s', p_table, p_where);
  get diagnostics n = row_count;
  return total + n;
end;
$fn$;

create temp table _org_a_borrar on commit drop as
  select id from public.organizations where id = '5c316995-deb4-459b-b805-032849d5baea';

do $$
declare
  cantidad integer;
  filas bigint;
begin
  select count(*) into cantidad from _org_a_borrar;
  if cantidad <> 1 then
    raise exception 'Se esperaba 1 organizacion y se encontraron %. No se borro nada.', cantidad;
  end if;

  filas := pg_temp.cp_purge('public.organizations'::regclass, 'id in (select id from _org_a_borrar)');
  raise notice 'Filas borradas: %', filas;
end $$;

-- La cuenta de prueba (focusarg.ok+cpqrtest@gmail.com) -- ya sin ninguna
-- organizacion ni venta despues del borrado de arriba.
delete from auth.users where email = 'focusarg.ok+cpqrtest@gmail.com';

select (select count(*) from public.organizations where id = '5c316995-deb4-459b-b805-032849d5baea') as organizaciones_que_quedan,
       (select count(*) from auth.users where email = 'focusarg.ok+cpqrtest@gmail.com') as usuario_que_queda;

rollback;
