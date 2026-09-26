-- Lista negra / personas restringidas: el organizador carga gente por DNI,
-- y en la puerta (app/control) el controlador ve una advertencia si la
-- entrada que esta validando es de alguien en la lista -- ADEMAS del
-- resultado normal de la entrada (valida/usada/etc), sin tocar
-- validate_ticket_manual ni el flujo existente. La decision final de dejar
-- entrar o no la sigue tomando el controlador.
begin;

create table if not exists public.blacklist_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  dni text not null,
  full_name text,
  reason text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blacklist_entries_org_idx on public.blacklist_entries (organization_id);

alter table public.blacklist_entries enable row level security;
revoke all on public.blacklist_entries from anon, authenticated;
grant all on public.blacklist_entries to service_role;

-- Chequea si un DNI esta en la lista negra ACTIVA de la organizacion dueña
-- del evento. Compara solo digitos (40.123.456, 40123456 y 40123456 con
-- espacios matchean igual). Mismo modelo de permisos que
-- validate_ticket_manual: admin de plataforma, organizador del evento, o
-- controlador asignado.
create or replace function public.check_blacklist(p_event_id uuid, p_dni text)
returns table(is_blacklisted boolean, reason text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org_id uuid;
  v_dni text;
  v_entry record;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  select organization_id into v_org_id from public.events where id = p_event_id;
  if v_org_id is null then raise exception 'El evento no existe.'; end if;

  if not (
    public.is_platform_admin()
    or public.is_event_organizer(p_event_id)
    or exists (
      select 1 from public.event_staff es
      join public.organization_members om on om.id = es.organization_member_id
      where es.event_id = p_event_id and es.staff_role = 'controller'
        and es.active = true and om.user_id = auth.uid() and om.status = 'active'
    )
  ) then
    raise exception 'No tenes permiso para consultar la lista negra de este evento.';
  end if;

  v_dni := regexp_replace(coalesce(p_dni, ''), '\D', '', 'g');
  if v_dni = '' then
    return query select false, null::text;
    return;
  end if;

  select * into v_entry from public.blacklist_entries
  where organization_id = v_org_id
    and active = true
    and regexp_replace(coalesce(dni, ''), '\D', '', 'g') = v_dni
  limit 1;

  if not found then
    return query select false, null::text;
    return;
  end if;

  return query select true, v_entry.reason;
end;
$function$;

grant execute on function public.check_blacklist(uuid, text) to authenticated;

commit;

notify pgrst, 'reload schema';
