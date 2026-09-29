-- cp_touch_presence() (20260940) es la unica via PENSADA para tocar
-- profiles.last_active_at, pero la RLS "profiles_update_own" es por FILA
-- (id = auth.uid()), no por columna: si "authenticated" tiene privilegio de
-- UPDATE a nivel de tabla sobre profiles (lo habitual en un proyecto
-- Supabase por defecto), cualquier organizador logueado puede pegarle un
-- UPDATE directo a su propia fila poniendo last_active_at en una fecha
-- futura (aparece "conectado ahora" para siempre en el admin, sin que su
-- navegador este siquiera abierto) o pasada (nunca figura conectado).
--
-- Un "revoke update (columna)" no alcanza si el permiso viene de un grant a
-- nivel de TABLA completa (un grant de columna no le gana a uno de tabla) --
-- y no se puede saber de antemano cual de los dos es, sin arriesgarse a un
-- fix que no haga nada. En cambio, un trigger que compare current_user SI
-- funciona sin importar el modelo de permisos: cp_touch_presence() es
-- SECURITY DEFINER, asi que durante esa llamada current_user pasa a ser el
-- DUEÑO de la funcion (confirmado en vivo: "postgres"), mientras que
-- cualquier UPDATE directo de un organizador sigue viendo current_user =
-- "authenticated". El trigger deja pasar el cambio solo en el primer caso.
begin;

create or replace function public.cp_protect_last_active_at()
returns trigger
language plpgsql
as $function$
begin
  if current_user <> 'postgres' and new.last_active_at is distinct from old.last_active_at then
    new.last_active_at := old.last_active_at;
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_protect_last_active_at on public.profiles;
create trigger profiles_protect_last_active_at
  before update on public.profiles
  for each row
  execute function public.cp_protect_last_active_at();

commit;

notify pgrst, 'reload schema';
