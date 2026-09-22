-- Bug real encontrado en revision: marcar una entrada como "no entregada"
-- (POST /api/entradas/[ticketId]/no-entregada) chequeaba si ya habia una
-- alerta activa con un SELECT separado del INSERT, sin ningun lock ni
-- constraint que lo garantizara. Dos clics rapidos (o dos pestañas) del
-- organizador sobre el mismo boton podian pasar los dos el SELECT antes de
-- que el primer INSERT se confirme, generando dos alertas de entrega
-- duplicadas para la misma entrada. Un indice unico parcial (solo mientras
-- la alerta sigue sin resolver) hace que la segunda insercion choque contra
-- el indice en vez de duplicarse; la ruta ya maneja ese choque (23505) como
-- "ya esta marcada", igual que ya hacia entradas/devolver con ticket_id.
begin;

create unique index if not exists ticket_delivery_attempts_active_alert_uidx
  on public.ticket_delivery_attempts (ticket_id)
  where status = 'failed' and resolved_at is null;

commit;
