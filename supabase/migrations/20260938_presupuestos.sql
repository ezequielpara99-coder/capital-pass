-- Presupuestos (solo admin de la plataforma): cotizaciones de diseño y de
-- alquiler de terminales de pago, con catalogo de items para reutilizar.
-- Montos en pesos enteros (_minor). Los items viven dentro del presupuesto
-- como jsonb: [{ description, quantity, unit, unit_price_minor }].
begin;

create sequence if not exists public.quote_number_seq start 1;

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique default nextval('public.quote_number_seq'),
  kind text not null default 'diseno' check (kind in ('diseno', 'rental', 'otro')),
  status text not null default 'borrador' check (status in ('borrador', 'enviado', 'aceptado', 'rechazado')),
  client_name text not null,
  client_contact text,
  client_phone text,
  client_email text,
  title text,
  -- Diseño: nombre de la fiesta y si es cliente mensual o fiesta eventual.
  event_name text,
  modality text check (modality is null or modality in ('mensual', 'eventual')),
  items jsonb not null default '[]'::jsonb,
  -- 'package' = un precio cerrado por todo el contenido; 'items' = suma de los precios por pieza.
  price_mode text not null default 'items' check (price_mode in ('items', 'package')),
  package_price_minor bigint not null default 0 check (package_price_minor >= 0),
  discount_type text not null default 'none' check (discount_type in ('none', 'percent', 'amount')),
  discount_value numeric not null default 0 check (discount_value >= 0),
  discount_label text,
  notes text,
  valid_days integer not null default 15 check (valid_days between 0 and 365),
  rental_inquiry_id uuid references public.rental_inquiries(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_items_is_array check (jsonb_typeof(items) = 'array')
);

create index if not exists quotes_created_at_idx on public.quotes (created_at desc);
create index if not exists quotes_status_idx on public.quotes (status);

create table if not exists public.quote_catalog (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'diseno' check (kind in ('diseno', 'rental', 'otro')),
  description text not null,
  unit text not null default 'u',
  unit_price_minor bigint not null default 0 check (unit_price_minor >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.quotes enable row level security;
alter table public.quote_catalog enable row level security;

revoke all on public.quotes from anon, authenticated;
revoke all on public.quote_catalog from anon, authenticated;
grant all on public.quotes to service_role;
grant all on public.quote_catalog to service_role;
grant usage, select on sequence public.quote_number_seq to service_role;

commit;

notify pgrst, 'reload schema';
