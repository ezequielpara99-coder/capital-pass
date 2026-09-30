-- =====================================================================
-- BORRADO DEFINITIVO de 15 ORGANIZACIONES DE PRUEBA (QA) y todo lo que
-- cuelga de ellas: sus eventos, ventas, entradas, miembros, etc.
--
-- Verificado antes de armar esto: ninguna tiene pagos de suscripcion
-- reales (subscription_payments vacio para las 15), y los 21 miembros
-- que tienen son todos cuentas de prueba (focusarg.ok+cpXXX@gmail.com o
-- @example.test) -- ninguna es tu cuenta real ni tu organizacion real.
--
-- Que borra: las 15 organizaciones de la lista + todo lo que las
--            referencia (eventos, ventas, entradas, miembros, cuenta de
--            Mercado Pago conectada de prueba, etc.), siguiendo las
--            claves foraneas de la base.
-- Que NO borra: ninguna otra organizacion, ni las cuentas de usuario
--               (auth.users) de las pruebas -- quedan sin ninguna
--               organizacion, inertes, no le pertenecen a nadie mas.
--
-- COMO USARLO (Supabase -> SQL Editor):
--   1) Corre primero el PASO 1 (vista previa, solo lectura) y confirma
--      que son exactamente las 15 organizaciones de prueba.
--   2) Corre el PASO 2 tal cual esta: es un ENSAYO (termina en ROLLBACK,
--      no borra nada) y te muestra si funciona y cuantas filas quedarian.
--   3) Si el ensayo sale bien, cambia la ultima linea (rollback;) por
--      commit; y corre el PASO 2 de nuevo: ahi si borra de verdad.
-- Va todo en una transaccion: si algo falla, no se borra nada.
-- Es IRREVERSIBLE una vez ejecutado con commit.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 1: VISTA PREVIA (solo lectura)
-- ---------------------------------------------------------------------
select o.id, o.name, o.slug, o.active,
       (select count(*) from public.events e where e.organization_id = o.id) as eventos,
       (select count(*) from public.organization_members m where m.organization_id = o.id) as miembros
from public.organizations o
where o.id in (
  'ef8806cb-7a8f-410c-9158-7bfe408dbc5a',
  'd68bdc4a-b44c-406a-9fb6-3030af73cfa4',
  '17a3fa7a-67f4-4d64-bb11-6354149fb270',
  'a5749246-6276-4c62-a99c-45248557ac2b',
  'b2a68ced-e366-48fe-93eb-b3bb910dc3e9',
  '9248dd20-39bb-4365-a655-f095b1b1b665',
  'd1b3c8e6-a351-4e9d-81ee-d331c5ad48e3',
  'f1eb487a-97e1-403c-8600-6cfbf1c613e0',
  '78bf0a6b-9413-4348-91f6-c91b633a39f4',
  '73855b55-88d0-4ef5-8a6f-5fc1c947f852',
  'b4c27752-b5fd-42b7-aa6a-9ebcf126bb8f',
  '8b4a40f3-e7af-477c-bae4-93a20372b997',
  '1559e451-df7a-4c19-8bc3-23fa305b5219',
  'f9931424-bb64-494b-9193-19a78e9fe56a',
  '11743f4f-c328-493c-b190-91d1ab78b6cd'
)
order by o.name;
-- Tienen que salir 15 filas, todas con nombre "QA ..." o "[QA - se puede
-- borrar] ...". Si no son esas, NO sigas.


-- ---------------------------------------------------------------------
-- PASO 2: BORRADO (correr todo junto, desde la linea BEGIN hasta la linea COMMIT)
-- ---------------------------------------------------------------------
begin;

-- >>> FUNCION (borra una tabla y, antes, todo lo que la referencia)
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
-- <<< FIN FUNCION

create temp table _orgs_a_borrar on commit drop as
  select id from public.organizations where id in (
    'ef8806cb-7a8f-410c-9158-7bfe408dbc5a',
    'd68bdc4a-b44c-406a-9fb6-3030af73cfa4',
    '17a3fa7a-67f4-4d64-bb11-6354149fb270',
    'a5749246-6276-4c62-a99c-45248557ac2b',
    'b2a68ced-e366-48fe-93eb-b3bb910dc3e9',
    '9248dd20-39bb-4365-a655-f095b1b1b665',
    'd1b3c8e6-a351-4e9d-81ee-d331c5ad48e3',
    'f1eb487a-97e1-403c-8600-6cfbf1c613e0',
    '78bf0a6b-9413-4348-91f6-c91b633a39f4',
    '73855b55-88d0-4ef5-8a6f-5fc1c947f852',
    'b4c27752-b5fd-42b7-aa6a-9ebcf126bb8f',
    '8b4a40f3-e7af-477c-bae4-93a20372b997',
    '1559e451-df7a-4c19-8bc3-23fa305b5219',
    'f9931424-bb64-494b-9193-19a78e9fe56a',
    '11743f4f-c328-493c-b190-91d1ab78b6cd'
  );

do $$
declare
  cantidad integer;
  filas bigint;
begin
  select count(*) into cantidad from _orgs_a_borrar;
  if cantidad <> 15 then
    raise exception 'Se esperaban 15 organizaciones y se encontraron %. No se borro nada.', cantidad;
  end if;

  filas := pg_temp.cp_purge('public.organizations'::regclass, 'id in (select id from _orgs_a_borrar)');
  raise notice 'Filas borradas en total (organizaciones y todo lo que colgaba de ellas): %', filas;
end $$;

-- Comprobacion final: tiene que dar 0.
select (select count(*) from public.organizations where id in (select id from _orgs_a_borrar)) as organizaciones_que_quedan;

-- ENSAYO: por defecto termina en ROLLBACK, o sea que ejecuta todo, te
-- muestra el resultado de arriba y DESHACE. No se borra nada.
-- Cuando el ensayo salga bien (sin errores y con 0), cambia la linea de
-- abajo por:  commit;   y volve a correr el PASO 2 para borrar de verdad.
rollback;
