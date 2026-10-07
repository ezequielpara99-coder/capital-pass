-- Estado automatico de los eventos (decision de Eze, 2026-10-06).
--
-- La puerta (escaneo y venta) solo funciona con el evento en 'active', y
-- el estado se cambiaba solo a mano: si el organizador se olvidaba, la
-- noche del evento no se podia escanear. Y un evento viejo que quedaba
-- 'active' le ganaba al de esta noche en la eleccion de evento del equipo.
--
-- cp_auto_event_status() (la corre /api/cron/estado-eventos cada 10 min):
--   * 'upcoming' -> 'active'   desde 6 h antes de starts_at;
--   * 'upcoming'/'active' -> 'finished' 12 h despues del cierre (ends_at,
--     o starts_at + 12 h si no tiene hora de cierre).
-- Cada cambio automatico se hace UNA sola vez por evento
-- (auto_activated_at / auto_finished_at): si despues el organizador lo
-- cambia a mano, se respeta. 'draft' y 'cancelled' no se tocan nunca.
begin;

-- updated_at ya existe en produccion; el "if not exists" es para el harness
-- de tests, que no la tiene.
alter table public.events add column if not exists updated_at timestamptz not null default now();
alter table public.events add column if not exists auto_activated_at timestamptz;
alter table public.events add column if not exists auto_finished_at timestamptz;

create or replace function public.cp_auto_event_status()
returns table (activated integer, finished integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_finished integer;
  v_activated integer;
begin
  -- Primero finalizar: un evento que ya termino no tiene que pasar por
  -- 'active' de camino.
  update public.events e
  set status = 'finished', auto_finished_at = now(), updated_at = now()
  where e.status in ('upcoming', 'active')
    and e.auto_finished_at is null
    and e.starts_at is not null
    and now() >= coalesce(e.ends_at, e.starts_at + interval '12 hours') + interval '12 hours';
  get diagnostics v_finished = row_count;

  update public.events e
  set status = 'active', auto_activated_at = now(), updated_at = now()
  where e.status = 'upcoming'
    and e.auto_activated_at is null
    and e.starts_at is not null
    and now() >= e.starts_at - interval '6 hours';
  get diagnostics v_activated = row_count;

  return query select v_activated, v_finished;
end;
$$;

revoke all on function public.cp_auto_event_status() from public, anon, authenticated;
grant execute on function public.cp_auto_event_status() to service_role;

commit;

notify pgrst, 'reload schema';
