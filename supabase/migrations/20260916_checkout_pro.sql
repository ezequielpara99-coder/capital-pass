-- Capital Pass: migrar el cobro de Suscripciones (Preapproval) a Checkout Pro.
-- El checkout de Suscripciones de Mercado Pago quedo roto del lado de la
-- plataforma ("Esta pagina no existe" con preapproval_id valido). Checkout Pro
-- no tiene ese problema, pero no es un debito automatico: cada periodo hay que
-- generar un link de pago nuevo (renovacion manual + recordatorio por email).
-- Ejecutar una vez en Supabase SQL Editor antes de publicar el codigo.
begin;

-- El candado de checkout ya no depende de si la fila tiene un preapproval_id
-- previo: con Checkout Pro cada intento (alta o renovacion) genera una
-- preference nueva, asi que solo hace falta el enfriamiento de 2 minutos
-- para evitar doble click.
create or replace function public.cp_lock_checkout(p_signup_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.subscription_signups set checkout_started_at = now()
  where id = p_signup_id
    and (checkout_started_at is null or checkout_started_at < now() - interval '2 minutes');
  return found;
end;
$$;
revoke all on function public.cp_lock_checkout(uuid) from public, anon, authenticated;
grant execute on function public.cp_lock_checkout(uuid) to service_role;

-- Rastrea si ya se envio el recordatorio de vencimiento para el periodo
-- actual, para no mandarlo mas de una vez por ciclo.
alter table public.organization_subscriptions
  add column if not exists reminder_sent_for_period_end timestamptz;

commit;
