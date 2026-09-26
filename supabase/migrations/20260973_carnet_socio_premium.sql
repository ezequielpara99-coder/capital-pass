-- Carnet de socio premium: cada socio tiene su propio QR firmado
-- (CPM1:<id>:<firma>, mismo mecanismo HMAC que las entradas). No es una
-- entrada -- escanearlo en la puerta solo identifica al socio, no bloquea
-- ni "usa" nada. Esta tabla deja un registro (best-effort) de cada
-- reconocimiento, para poder ver despues quien vino a que evento.
begin;

create table if not exists public.premium_member_scans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.premium_members(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  scanned_by uuid references public.organization_members(id) on delete set null,
  method text not null default 'qr' check (method in ('qr', 'manual')),
  created_at timestamptz not null default now()
);
create index if not exists premium_member_scans_member_idx on public.premium_member_scans (member_id);
create index if not exists premium_member_scans_event_idx on public.premium_member_scans (event_id);

alter table public.premium_member_scans enable row level security;
revoke all on public.premium_member_scans from anon, authenticated;
grant all on public.premium_member_scans to service_role;

commit;

notify pgrst, 'reload schema';
