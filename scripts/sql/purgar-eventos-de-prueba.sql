-- =====================================================================
-- BORRADO DEFINITIVO de 11 eventos de PRUEBA (y todo lo que cuelga de ellos).
--
-- Que borra:  los eventos de la lista de abajo + sus ventas, entradas, tandas,
--             escaneos, barras, mesas, colectivos, etc. (todo lo que los
--             referencie, siguiendo las claves foraneas de la base).
-- Que NO borra: organizaciones, miembros/usuarios, ni ningun otro evento.
--               Los compradores de esas ventas se borran solo si ya no los
--               usa ninguna otra venta.
--
-- COMO USARLO (Supabase -> SQL Editor):
--   1) Corre primero el PASO 1 (vista previa, solo lectura) y confirma que
--      son exactamente los eventos que queres borrar.
--   2) Recien despues corre el PASO 2. Va todo en una transaccion: si algo
--      falla, no se borra nada.
-- Es IRREVERSIBLE una vez ejecutado el PASO 2.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 1: VISTA PREVIA (solo lectura)
-- ---------------------------------------------------------------------
select e.slug, e.name as evento, o.name as organizacion, e.status,
       (select count(*) from public.sales s where s.event_id = e.id) as ventas,
       (select count(*) from public.tickets t where t.event_id = e.id) as entradas
from public.events e
join public.organizations o on o.id = e.organization_id
where e.slug in (
  'qa-control-offline-event-1790258962242',
  'qa-control-offline-event-1790258937187',
  'qa-control-offline-event-1790258924734',
  'qa-trial-event-1790253892729',
  'qa-refund-event-1790210051700',
  'qa-refund-event-1790210009952',
  'qa-refund-event-1790209972551',
  'qa-refund-event-1790209937581',
  'qa-verify-event-1790204520011',
  'qa-test-evento-ed4543',
  'primavera-2026'
)
order by e.slug;
-- Tienen que salir 11 filas. Si no son esas, NO sigas.


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
  child_col text;
  parent_col text;
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
    if array_length(fk.conkey, 1) <> 1 then
      raise exception 'Clave foranea compuesta no soportada en %', fk.child;
    end if;
    select attname into child_col from pg_attribute where attrelid = fk.conrelid and attnum = fk.conkey[1];
    select attname into parent_col from pg_attribute where attrelid = fk.confrelid and attnum = fk.confkey[1];
    child_where := format('%I in (select %I from %s where %s)', child_col, parent_col, p_table, p_where);

    if fk.confdeltype = 'n' or fk.conrelid = fk.confrelid then
      -- La base pondria NULL (o es autorreferencia): se hace lo mismo, sin borrar filas ajenas.
      execute format('update %s set %I = null where %s', fk.child, child_col, child_where);
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

create temp table _eventos_a_borrar on commit drop as
  select id from public.events where slug in (
    'qa-control-offline-event-1790258962242',
    'qa-control-offline-event-1790258937187',
    'qa-control-offline-event-1790258924734',
    'qa-trial-event-1790253892729',
    'qa-refund-event-1790210051700',
    'qa-refund-event-1790210009952',
    'qa-refund-event-1790209972551',
    'qa-refund-event-1790209937581',
    'qa-verify-event-1790204520011',
    'qa-test-evento-ed4543',
    'primavera-2026'
  );

-- Compradores que solo aparecen en las ventas que se van a borrar.
create temp table _compradores on commit drop as
  select distinct s.buyer_id as id from public.sales s
  where s.event_id in (select id from _eventos_a_borrar) and s.buyer_id is not null;

do $$
declare
  cantidad integer;
  filas bigint;
begin
  select count(*) into cantidad from _eventos_a_borrar;
  if cantidad <> 11 then
    raise exception 'Se esperaban 11 eventos y se encontraron %. No se borro nada.', cantidad;
  end if;

  filas := pg_temp.cp_purge('public.events'::regclass, 'id in (select id from _eventos_a_borrar)');
  raise notice 'Filas borradas en total (eventos y todo lo que colgaba de ellos): %', filas;
end $$;

-- Compradores huerfanos (si otra tabla todavia los usa, se conservan).
do $$
begin
  delete from public.buyers b
  where b.id in (select id from _compradores)
    and not exists (select 1 from public.sales s where s.buyer_id = b.id);
exception when foreign_key_violation then
  raise notice 'Algunos compradores se conservan porque otra tabla los usa.';
end $$;

-- Comprobacion final: tiene que dar 0 en las tres columnas.
select
  (select count(*) from public.events where slug like 'qa-%' or slug = 'primavera-2026') as eventos_de_prueba_que_quedan,
  (select count(*) from public.sales s where s.event_id in (select id from _eventos_a_borrar)) as ventas_que_quedan,
  (select count(*) from public.tickets t where t.event_id in (select id from _eventos_a_borrar)) as entradas_que_quedan;

commit;
