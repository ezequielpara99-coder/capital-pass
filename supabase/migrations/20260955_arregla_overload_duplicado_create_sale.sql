-- Problema real encontrado en produccion al verificar la migracion
-- anterior: 20260953 (combo snapshot) se corrio DOS veces -- la primera
-- vez fallo a mitad de camino (las columnas de tickets no quedaron
-- creadas) y se volvio a correr sola despues para arreglarlo. Pero para
-- entonces 20260954 (idempotencia) ya se habia aplicado, y 20260953
-- define create_sale con 10 parametros (sin p_idempotency_key) -- un
-- "create or replace" NO reemplaza una funcion de otra firma, crea una
-- SEGUNDA version al lado. Quedaron dos create_sale simultaneos (10 y
-- 11 parametros), y Postgres no puede elegir cual usar si el llamado no
-- incluye p_idempotency_key explicitamente ("No se pudo elegir la mejor
-- funcion candidata"). El codigo actual siempre manda esa clave, pero es
-- una funcion duplicada fragil que hay que limpiar.
begin;

drop function if exists public.create_sale(uuid, uuid, integer, text, text, text, text, text, text, uuid);

commit;

notify pgrst, 'reload schema';
