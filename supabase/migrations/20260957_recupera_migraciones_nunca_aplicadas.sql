-- Al revisar la migracion anterior se detecto que varias migraciones de
-- ESTA SESION nunca se habian llegado a correr en produccion (quedaron
-- "perdidas" en algun momento). Se confirmo con una consulta directa a
-- la base real. Esta migracion junta solo las partes que faltaban --
-- SIN tocar ninguna funcion que ya este definida correctamente por una
-- migracion posterior (serian pisadas por una version vieja si se
-- re-corriera el archivo original completo fuera de orden).
--
-- Impacto real de lo que faltaba:
-- 1) stock_trial no existia -- cp_org_has_stock_access (ya vigente,
--    definida en 20260948) consulta esta tabla para cualquier
--    organizacion que no sea de cortesia ni tenga plan avanzado
--    aprobado: el SELECT fallaba con un error real de Postgres,
--    rompiendo TODO el modulo de stock (venta de barra, asignar stock,
--    canjear combo) para esas organizaciones.
-- 2) sales.last_reconciled_at no existia -- POST
--    /api/e/[slug]/checkout/verificar ("Verificar mi pago" en la
--    pagina publica del evento) hacia un SELECT que fallaba, y como el
--    codigo no revisa el error, el comprador veia "No encontramos esa
--    venta" aunque la venta existiera.
-- 3) rate_limit_buckets no existia -- cp_check_rate_limit fallaba, y
--    checkRateLimit() esta escrito para "fallar abierto" en ese caso
--    (no bloquea la request real por un problema del limitador), asi
--    que no se notaba nada roto pero TODOS los limites de tasa
--    agregados esta sesion (checkout, formulario de rentals, alertas
--    de stock bajo) estaban desactivados en silencio.
begin;

-- 1) De 20260926_plan_avanzado_trial_stock.sql (solo la tabla -- la
-- funcion cp_org_has_stock_access que la usa ya esta correctamente
-- definida por 20260948, no se toca aca).
create table if not exists public.stock_trial (
  organization_id uuid primary key references public.organizations(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null
);
alter table public.stock_trial enable row level security;
revoke all on public.stock_trial from anon, authenticated;
grant all on public.stock_trial to service_role;

-- 2) De 20260949_cooldown_verificar_venta.sql (completa, es solo una columna).
alter table public.sales add column if not exists last_reconciled_at timestamptz;

-- 3) De 20260950_rate_limiting.sql (completa: tabla + funcion).
create table if not exists public.rate_limit_buckets (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);
alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from anon, authenticated;
grant all on public.rate_limit_buckets to service_role;

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

-- 4) De 20260943_presupuestos_clientes.sql (completa, la tabla del
-- directorio de clientes de presupuestos -- es la que mostro el error
-- en pantalla).
create table if not exists public.quote_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quote_clients_name_idx on public.quote_clients (name);
alter table public.quote_clients enable row level security;
revoke all on public.quote_clients from anon, authenticated;
grant all on public.quote_clients to service_role;

commit;

notify pgrst, 'reload schema';
