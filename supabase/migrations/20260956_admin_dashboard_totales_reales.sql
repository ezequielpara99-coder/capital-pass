-- Bug real encontrado en revision: /admin traia organizations/events con
-- .limit(8) (para la tabla de "recientes") y organization_members/sales
-- con .limit(500), y usaba ESAS MISMAS filas capadas para calcular los
-- totales de arriba (Organizaciones, Usuarios, Ventas, Total vendido).
-- "Organizaciones" ya mostraba como maximo 8 sin ningun aviso de que
-- estaba truncado (a diferencia de "Eventos", que si decia "ultimos
-- cargados"). Con 500+ ventas o miembros el problema se repetiria ahi
-- tambien. Esta funcion calcula los totales reales con agregados de
-- Postgres, sin traer filas a JS ni depender de ningun limite.
begin;

create or replace function public.cp_admin_dashboard_totals()
returns table(
  organizations_count integer,
  events_count integer,
  active_members_count integer,
  organizers_count integer,
  sales_count integer,
  total_sales_minor bigint
)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::integer from public.organizations),
    (select count(*)::integer from public.events),
    (select count(*)::integer from public.organization_members where status = 'active'),
    (select count(*)::integer from public.organization_members where status = 'active' and role = 'organizer'),
    (select count(*)::integer from public.sales where status = 'confirmed'),
    (select coalesce(sum(total_minor), 0)::bigint from public.sales where status = 'confirmed')
$$;
revoke all on function public.cp_admin_dashboard_totals() from public, anon, authenticated;
grant execute on function public.cp_admin_dashboard_totals() to service_role;

commit;

notify pgrst, 'reload schema';
