-- Capital Rentals: alquiler de terminales de venta (POS) para bares,
-- boliches y eventos. Guarda las consultas que llegan desde el formulario
-- publico de la landing; se leen/gestionan desde el admin.
begin;

create table public.rental_inquiries (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text not null,
  phone text not null,
  email text,
  city text,
  terminal_quantity text,
  message text,
  status text not null default 'nuevo',
  created_at timestamptz not null default now()
);
alter table public.rental_inquiries enable row level security;
revoke all on public.rental_inquiries from anon, authenticated;
grant all on public.rental_inquiries to service_role;

commit;
