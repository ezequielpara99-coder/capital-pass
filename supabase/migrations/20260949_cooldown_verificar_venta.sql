-- Bug real encontrado en revision: POST /api/e/[slug]/checkout/verificar
-- es publica (sin sesion, solo necesita el UUID de la venta, ya visible en
-- la URL de vuelta de Mercado Pago) y, mientras la venta siga
-- 'pending_approval', cada llamada dispara una consulta real a la API de
-- pagos de Mercado Pago (payments/search). Sin ningun limite, alguien
-- podia spamear el mismo saleId (o encadenarlo con POST /checkout para
-- generar saleIds gratis) y agotar la cuota/rate limit de la cuenta de
-- Mercado Pago de la PLATAFORMA -- afectando a todos los organizadores,
-- no solo a un evento. Esta columna guarda cuando fue el ultimo intento
-- real de reconciliar, para que la ruta pueda saltear la llamada a MP si
-- ya se intento hace poco.
begin;

alter table public.sales add column if not exists last_reconciled_at timestamptz;

commit;
