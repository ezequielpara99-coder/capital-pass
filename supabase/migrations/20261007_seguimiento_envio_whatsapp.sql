-- El organizador pidio poder ver, para las ventas en persona (puerta,
-- RRPP, organizador -- las que se entregan por WhatsApp, no por mail
-- automatico), cuales ya se mandaron y cuales todavia estan pendientes de
-- que el vendedor le pegue al boton de WhatsApp. No hay forma de saber si
-- el mensaje realmente llego o se leyo (eso requeriria la API paga de
-- WhatsApp Business), pero SI se puede registrar el momento en que el
-- vendedor efectivamente abrio WhatsApp para mandarla -- mismo patron que
-- ya existe para el mail (sales.ticket_email_sent_at).
begin;

alter table public.sales add column if not exists whatsapp_sent_at timestamptz;

commit;

notify pgrst, 'reload schema';
