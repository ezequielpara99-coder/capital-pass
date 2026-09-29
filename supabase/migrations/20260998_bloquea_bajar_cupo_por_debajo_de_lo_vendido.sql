-- Bug real confirmado en vivo con Eze (consultas de verificacion sobre
-- pg_trigger y pg_constraint en Supabase): borrar una tanda con ventas SI
-- esta bloqueado por las claves foraneas de sale_items/ticket_packs (no
-- hacia falta nada mas ahi), pero bajar el cupo (capacity) de una tanda por
-- debajo de lo ya vendido NO tenia ninguna proteccion en la base -- la
-- unica validacion era del lado del cliente en app/panel/evento/page.tsx,
-- que compara contra datos ya cargados en pantalla (puede estar
-- desactualizado) y que ademas se puede saltear llamando a Postgres
-- directo (el panel usa la clave anon, no una ruta de API propia). La
-- pantalla ya esperaba este mensaje especifico ("No podés reducir el
-- cupo...", ver readableDatabaseError en app/panel/evento/page.tsx) para
-- mostrarlo amigable -- solo faltaba que la base realmente lo mandara.
begin;

create or replace function public.cp_ticket_type_capacity_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_sold integer;
begin
  if new.capacity is not null and new.capacity is distinct from old.capacity then
    select count(*)::integer into v_sold
    from public.tickets t
    where t.ticket_type_id = new.id and t.status <> 'cancelled';

    if new.capacity < v_sold then
      raise exception 'No podés reducir el cupo a % porque ya hay % entradas vendidas.', new.capacity, v_sold;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists ticket_types_capacity_guard on public.ticket_types;
create trigger ticket_types_capacity_guard
  before update of capacity on public.ticket_types
  for each row
  execute function public.cp_ticket_type_capacity_guard();

commit;

notify pgrst, 'reload schema';
