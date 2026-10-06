-- Contador publico para la pagina de Capital Studio (capitalstudio.ar):
-- "eventos que ya se hicieron con Capital Pass" (pedido de Eze, 2026-10-06).
-- Devuelve SOLO un numero: eventos terminados, en curso o proximos (no cuenta
-- borradores ni cancelados). No expone nombres, ventas ni ningun otro dato.
-- Solo lectura; se puede llamar sin sesion (rol anon) por la API REST:
--   POST /rest/v1/rpc/public_events_count
create or replace function public.public_events_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.events
  where status in ('upcoming', 'active', 'finished');
$$;

revoke all on function public.public_events_count() from public;
grant execute on function public.public_events_count() to anon, authenticated;
