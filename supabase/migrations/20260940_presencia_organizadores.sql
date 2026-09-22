-- Presencia: cada usuario logueado "avisa" cada tanto que sigue activo
-- (heartbeat desde el navegador). El admin lo usa para ver cuantos
-- organizadores estan conectados ahora mismo.
begin;

alter table public.profiles add column if not exists last_active_at timestamptz;

create or replace function public.cp_touch_presence()
returns void language sql volatile security definer set search_path = '' as $$
  update public.profiles set last_active_at = now() where id = auth.uid();
$$;
revoke all on function public.cp_touch_presence() from public, anon;
grant execute on function public.cp_touch_presence() to authenticated;

commit;

notify pgrst, 'reload schema';
