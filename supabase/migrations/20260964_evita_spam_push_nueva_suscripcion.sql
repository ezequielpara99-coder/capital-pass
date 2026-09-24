-- El push "Nueva suscripcion" a los admins de la plataforma se reenviaba
-- cada vez que applyPayment corria con un pago ya aprobado, mientras el
-- conteo de pagos aprobados de la organizacion siguiera siendo 1 -- eso es
-- TODO el primer periodo de facturacion, no solo la primera vez. El
-- polling de /cuenta (cada 10s, hasta 6 veces tras volver de Mercado
-- Pago) mas los reintentos normales del webhook podian mandar la misma
-- alerta 5-10+ veces por una sola alta real.
--
-- Se agrega una marca de "ya se avisó" por organizacion, reclamada de
-- forma atomica (UPDATE ... WHERE ... IS NULL) para que, aunque dos
-- llamadas corran casi al mismo tiempo, solo una gane la carrera y mande
-- el push.
begin;

alter table public.organizations
  add column if not exists new_subscription_notified_at timestamptz;

commit;
