-- Capital Sales Agent (MVP 1): prospeccion comercial asistida para conseguir
-- clientes de Capital Pass. Es SOLO para el admin de la plataforma (Eze), no
-- tiene nada que ver con los organizadores/socios. No hace scraping ni
-- automatiza cuentas de redes: el admin carga o importa cada prospecto (a
-- mano o por CSV) y el sistema investiga la pagina publica que el admin
-- indica, calcula un puntaje, arma mensajes y deja todo en un CRM chico.
--
-- No hacen falta funciones RPC (security definer): igual que presupuestos/
-- finanzas, todo pasa por rutas de API que verifican verifyAdmin() y despues
-- usan el cliente de servicio directo -- no hay dinero ni datos de
-- organizadores/clientes de por medio.
begin;

create table if not exists public.prospect_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  province text,
  categories text[] not null default '{}',
  min_score integer not null default 0 check (min_score between 0 and 100),
  target_count integer check (target_count is null or target_count > 0),
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'instagram', 'email')),
  message_style text not null default 'natural' check (message_style in ('directo', 'natural', 'profesional')),
  status text not null default 'activa' check (status in ('activa', 'pausada', 'cerrada')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists prospect_campaigns_status_idx on public.prospect_campaigns (status) where deleted_at is null;

alter table public.prospect_campaigns enable row level security;
revoke all on public.prospect_campaigns from anon, authenticated;
grant all on public.prospect_campaigns to service_role;

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.prospect_campaigns(id) on delete set null,
  name text not null,
  instagram_username text,
  instagram_url text,
  website text,
  -- Normalizados por la app (lib/sales-agent/duplicates.ts), no en SQL: es
  -- la MISMA logica que se usa para chequear duplicados antes de guardar, y
  -- estos indices son la ultima linea de defensa contra una carrera.
  website_domain text,
  phone_digits text,
  email_norm text,
  city text,
  province text,
  country text not null default 'Argentina',
  category text,
  followers integer check (followers is null or followers >= 0),
  events_per_month integer check (events_per_month is null or events_per_month >= 0),
  email text,
  phone text,
  whatsapp text,
  ticketing_provider text,
  ticketing_url text,
  ticketing_confidence text check (ticketing_confidence is null or ticketing_confidence in ('alta', 'media', 'baja')),
  score integer not null default 0 check (score between 0 and 100),
  score_reasons jsonb not null default '[]'::jsonb,
  score_missing jsonb not null default '[]'::jsonb,
  potential text not null default 'bajo' check (potential in ('bajo', 'medio', 'alto', 'prioridad')),
  status text not null default 'nuevo' check (status in (
    'nuevo', 'investigando', 'calificado', 'listo_para_contactar', 'contactado',
    'respondio', 'interesado', 'demo', 'negociacion', 'cliente', 'no_interesado', 'no_contactar'
  )),
  source text not null default 'manual' check (source in ('manual', 'csv', 'automatico')),
  responsible_user_id uuid references auth.users(id) on delete set null,
  notes text,
  last_contacted_at timestamptz,
  next_followup_at timestamptz,
  investigated_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Duplicados: mismo criterio que usa la app antes de guardar. Parciales
-- (excluyen null y borrados) para no bloquear filas sin ese dato.
create unique index if not exists prospects_instagram_uq on public.prospects (lower(instagram_username)) where instagram_username is not null and deleted_at is null;
create unique index if not exists prospects_website_domain_uq on public.prospects (website_domain) where website_domain is not null and deleted_at is null;
create unique index if not exists prospects_phone_uq on public.prospects (phone_digits) where phone_digits is not null and deleted_at is null;
create unique index if not exists prospects_email_uq on public.prospects (email_norm) where email_norm is not null and deleted_at is null;

create index if not exists prospects_status_idx on public.prospects (status) where deleted_at is null;
create index if not exists prospects_campaign_idx on public.prospects (campaign_id) where deleted_at is null;
create index if not exists prospects_city_idx on public.prospects (city) where deleted_at is null;
create index if not exists prospects_score_idx on public.prospects (score desc) where deleted_at is null;
create index if not exists prospects_next_followup_idx on public.prospects (next_followup_at) where deleted_at is null and next_followup_at is not null;

alter table public.prospects enable row level security;
revoke all on public.prospects from anon, authenticated;
grant all on public.prospects to service_role;

create table if not exists public.prospect_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  name text not null,
  event_date date,
  url text,
  source text,
  kind text not null default 'reciente' check (kind in ('reciente', 'proximo')),
  created_at timestamptz not null default now()
);
create index if not exists prospect_events_prospect_idx on public.prospect_events (prospect_id);

alter table public.prospect_events enable row level security;
revoke all on public.prospect_events from anon, authenticated;
grant all on public.prospect_events to service_role;

create table if not exists public.prospect_opportunities (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  type text not null,
  description text not null,
  priority text not null default 'media' check (priority in ('baja', 'media', 'alta')),
  created_at timestamptz not null default now()
);
create index if not exists prospect_opportunities_prospect_idx on public.prospect_opportunities (prospect_id);

alter table public.prospect_opportunities enable row level security;
revoke all on public.prospect_opportunities from anon, authenticated;
grant all on public.prospect_opportunities to service_role;

create table if not exists public.prospect_messages (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  campaign_id uuid references public.prospect_campaigns(id) on delete set null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'instagram', 'email', 'otro')),
  style text not null check (style in ('directo', 'natural', 'profesional')),
  message text not null,
  status text not null default 'borrador' check (status in ('borrador', 'aprobado', 'enviado', 'descartado')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  sent_at timestamptz
);
create index if not exists prospect_messages_prospect_idx on public.prospect_messages (prospect_id, created_at desc);

alter table public.prospect_messages enable row level security;
revoke all on public.prospect_messages from anon, authenticated;
grant all on public.prospect_messages to service_role;

create table if not exists public.prospect_followups (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  message_id uuid references public.prospect_messages(id) on delete set null,
  scheduled_at timestamptz not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'hecho', 'omitido')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists prospect_followups_prospect_idx on public.prospect_followups (prospect_id);
create index if not exists prospect_followups_pending_idx on public.prospect_followups (scheduled_at) where status = 'pendiente';

alter table public.prospect_followups enable row level security;
revoke all on public.prospect_followups from anon, authenticated;
grant all on public.prospect_followups to service_role;

create table if not exists public.prospect_interactions (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  channel text,
  type text not null default 'nota' check (type in ('nota', 'respuesta', 'llamada', 'reunion', 'otro')),
  content text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists prospect_interactions_prospect_idx on public.prospect_interactions (prospect_id, created_at desc);

alter table public.prospect_interactions enable row level security;
revoke all on public.prospect_interactions from anon, authenticated;
grant all on public.prospect_interactions to service_role;

create table if not exists public.prospect_conversions (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  campaign_id uuid references public.prospect_campaigns(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  plan_label text,
  monthly_value_minor bigint check (monthly_value_minor is null or monthly_value_minor >= 0),
  notes text,
  converted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists prospect_conversions_prospect_idx on public.prospect_conversions (prospect_id);

alter table public.prospect_conversions enable row level security;
revoke all on public.prospect_conversions from anon, authenticated;
grant all on public.prospect_conversions to service_role;

commit;

notify pgrst, 'reload schema';
