-- Los paquetes predeterminados tambien pueden traer notas por defecto (el
-- detalle largo del servicio, condiciones especificas...), no solo items.
-- Al elegir el paquete en un presupuesto, esas notas se copian junto con el
-- contenido, listas para editar.
begin;

alter table public.quote_packages add column if not exists notes text;

commit;

notify pgrst, 'reload schema';
