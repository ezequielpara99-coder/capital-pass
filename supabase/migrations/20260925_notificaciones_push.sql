-- Capital Pass: notificaciones push para el organizador (venta de barra/mesa
-- en tiempo real, stock bajo, y un resumen periodico configurable). Mismo
-- patron de siempre: tablas nuevas con revoke total + acceso solo via
-- service_role, todo el envio real pasa por API routes en Node (Postgres
-- no puede pegarle a la Web Push API directamente).
begin;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant all on public.push_subscriptions to service_role;

create table public.notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bar_sale_alerts boolean not null default true,
  low_stock_alerts boolean not null default true,
  summary_interval_minutes integer, -- null = resumen desactivado
  last_summary_sent_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
revoke all on public.notification_settings from anon, authenticated;
grant all on public.notification_settings to service_role;

commit;
