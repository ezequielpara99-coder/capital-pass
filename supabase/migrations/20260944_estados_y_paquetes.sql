-- 1) Estados de presupuesto mas simples: "revision" y "a_pagar" en vez de
--    "enviado" (mismo paso del proceso, nombre mas claro para el flujo real:
--    Borrador -> En revision -> A pagar -> Aceptado / Rechazado).
-- 2) Paquetes predeterminados: plantillas de contenido + precio que el
--    admin arma una vez ("Paquete Emprendedores", "Paquete Boliches"...) y
--    despues elige con un toque al armar un presupuesto nuevo.
begin;

-- La restricción vieja hay que sacarla ANTES de tocar los datos: mientras
-- sigue activa no permite escribir "revision" en ninguna fila.
alter table public.quotes drop constraint if exists quotes_status_check;

update public.quotes set status = 'revision' where status = 'enviado';

alter table public.quotes add constraint quotes_status_check
  check (status in ('borrador', 'revision', 'a_pagar', 'aceptado', 'rechazado'));

create table if not exists public.quote_packages (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'diseno' check (kind in ('diseno', 'rental', 'otro')),
  name text not null,
  items jsonb not null default '[]'::jsonb,
  price_mode text not null default 'package' check (price_mode in ('items', 'package')),
  package_price_minor bigint not null default 0 check (package_price_minor >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_packages_items_is_array check (jsonb_typeof(items) = 'array')
);

create index if not exists quote_packages_kind_idx on public.quote_packages (kind);

alter table public.quote_packages enable row level security;
revoke all on public.quote_packages from anon, authenticated;
grant all on public.quote_packages to service_role;

commit;

notify pgrst, 'reload schema';
