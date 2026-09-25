-- Arregla 2 bugs reales encontrados en auditoria:
--
-- 1. El email de entrada con QR de una compra ONLINE nunca se disparaba en
--    el camino real: el webhook de Mercado Pago que confirma la venta
--    (webhook-ventas) llamaba directo al RPC confirm_online_sale, sin pasar
--    por el codigo que manda el email (applySalePayment). Se arregla en el
--    codigo (lib/billing/server.ts + webhook-ventas/route.ts), esta
--    migracion solo agrega la columna que hace falta para el reclamo
--    atomico del envio (evita mandar el mismo mail 2 veces si el webhook y
--    el "Verificar mi pago" del comprador llegan casi al mismo tiempo).
begin;

alter table public.sales add column if not exists ticket_email_sent_at timestamptz;

commit;

notify pgrst, 'reload schema';
