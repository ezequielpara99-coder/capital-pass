-- Alertas de cobro pendiente: un cron diario avisa (push a los admins de
-- plataforma) si hay presupuestos facturados con mas de 15 dias sin
-- cobrarse. Una fila por dia reclama el aviso de ESE dia de forma atomica
-- (insert...on conflict do nothing) -- si el cron se reintenta o se
-- solapa, solo el primero manda el push, mismo patron ya usado para evitar
-- el spam de "nueva suscripcion" y el resumen de ventas.
begin;

create table if not exists public.payment_reminders_log (
  sent_date date primary key,
  created_at timestamptz not null default now()
);

alter table public.payment_reminders_log enable row level security;
revoke all on public.payment_reminders_log from anon, authenticated;
grant all on public.payment_reminders_log to service_role;

commit;

notify pgrst, 'reload schema';
