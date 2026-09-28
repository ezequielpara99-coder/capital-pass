-- Bugs reales encontrados en una ronda de auditoria sobre Capital Sales
-- Agent (20260990):
--
-- 1. El telefono se comparaba con los digitos crudos exactos
--    (phone_digits): el mismo numero cargado con o sin el "9" de WhatsApp
--    Argentina (o con o sin codigo de pais) no se detectaba como duplicado.
--    Agrega phone_match_key (ultimos 10 digitos, que es justo para lo que
--    ya existia la funcion pura phoneMatchKey() sin estar conectada a nada)
--    con su propio indice unico parcial.
--
-- 2. Un doble click en "Convertir en cliente" podia insertar dos filas de
--    prospect_conversions para el mismo prospecto. Agrega un indice unico
--    (ultima linea de defensa; el chequeo principal queda en la API).
begin;

alter table public.prospects add column if not exists phone_match_key text;
update public.prospects set phone_match_key = right(phone_digits, 10) where phone_digits is not null and phone_match_key is null;

create unique index if not exists prospects_phone_match_uq on public.prospects (phone_match_key) where phone_match_key is not null and deleted_at is null;

create unique index if not exists prospect_conversions_prospect_uq on public.prospect_conversions (prospect_id);

commit;

notify pgrst, 'reload schema';
