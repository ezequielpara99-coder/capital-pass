-- Bug real encontrado en una ronda de auditoria sobre perfil de
-- organizadores: first_name/last_name/phone no tenian ningun limite de
-- largo ni en el cliente (cosmetico, se saltea con un POST directo) ni en
-- la base -- un organizador podia guardar un nombre de miles de caracteres
-- que se muestra sin truncar en "Conectados ahora" del admin.
--
-- (La misma ronda encontro que profiles.last_active_at -- pensada para
-- tocarse SOLO via cp_touch_presence(), 20260940 -- podria ser
-- pisable con un UPDATE directo si "authenticated" tiene privilegio de
-- UPDATE a nivel de TABLA en la base real, no solo por la policy de RLS.
-- Un "revoke update (last_active_at)" no alcanza si ya hay un grant de
-- tabla completa (un grant de columna no le gana a uno de tabla). Antes de
-- tocar eso hace falta confirmar en vivo que privilegios tiene
-- "authenticated" hoy sobre profiles -- se deja pendiente para no arriesgar
-- con un fix a ciegas que podria terminar sin efecto, o peor, rompiendo el
-- propio heartbeat de presencia.)
begin;

alter table public.profiles add constraint profiles_first_name_length check (char_length(first_name) <= 200) not valid;
alter table public.profiles add constraint profiles_last_name_length check (char_length(last_name) <= 200) not valid;
alter table public.profiles add constraint profiles_phone_length check (phone is null or char_length(phone) <= 60) not valid;

-- "not valid" no exige que las filas EXISTENTES ya cumplan (evita romper el
-- deploy si alguna fila vieja se pasara del limite) -- validate las chequea
-- ahora mismo pero sin bloquear escrituras concurrentes como haria un check
-- agregado sin "not valid".
alter table public.profiles validate constraint profiles_first_name_length;
alter table public.profiles validate constraint profiles_last_name_length;
alter table public.profiles validate constraint profiles_phone_length;

commit;

notify pgrst, 'reload schema';
