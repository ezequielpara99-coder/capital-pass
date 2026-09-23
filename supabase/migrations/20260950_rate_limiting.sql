-- Ninguna ruta publica de Capital Pass tenia limite de tasa: alguien podia
-- mandar miles de requests por minuto contra el checkout de un evento (cada
-- una toma un lock sobre la tanda y llama a la API de Mercado Pago),
-- contra "Verificar mi pago" (cada una golpea la API de pagos), o contra
-- el formulario de Rentals (cada una manda un email real por Resend), sin
-- ningun freno. Esto agrega un limitador simple por ventana fija,
-- guardado en la base (no hay Redis/Upstash en el proyecto) para que
-- funcione igual sin importar cuantas instancias serverless esten
-- corriendo a la vez.
begin;

create table if not exists public.rate_limit_buckets (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from anon, authenticated;
grant all on public.rate_limit_buckets to service_role;

-- Ventana fija: si la fila existe y sigue dentro de la ventana, suma 1;
-- si la ventana ya vencio, la reinicia en 1. Devuelve true si esta
-- request todavia entra dentro del limite (count <= p_max_requests).
create or replace function public.cp_check_rate_limit(
  p_key text, p_max_requests integer, p_window_seconds integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  insert into public.rate_limit_buckets (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case
      when public.rate_limit_buckets.window_start > now() - make_interval(secs => p_window_seconds)
        then public.rate_limit_buckets.count + 1
        else 1
    end,
    window_start = case
      when public.rate_limit_buckets.window_start > now() - make_interval(secs => p_window_seconds)
        then public.rate_limit_buckets.window_start
        else now()
    end
  returning count into v_count;

  return v_count <= p_max_requests;
end;
$$;
revoke all on function public.cp_check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.cp_check_rate_limit(text, integer, integer) to service_role;

commit;

notify pgrst, 'reload schema';
