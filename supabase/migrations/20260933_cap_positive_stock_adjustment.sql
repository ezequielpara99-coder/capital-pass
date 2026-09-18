-- Bug real encontrado en revision: assign_stock_to_bar no deja asignar mas
-- del total_stock comprado, pero adjust_bar_stock (el ajuste manual "suma
-- o resta" del panel) no tenia ningun tope -- un ajuste positivo podia
-- dejar mas stock en las barras del que la organizacion realmente compro,
-- sin ninguna señal de que algo esta mal en los reportes.
begin;

create or replace function public.adjust_bar_stock(
  p_bar_id uuid, p_event_product_id uuid, p_quantity_delta integer, p_type text, p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_organization_id uuid;
  v_current integer;
  v_movement_type public.stock_movement_type;
  v_total_stock integer;
  v_total_across_bars integer;
begin
  if p_type not in ('ajuste', 'perdida') then
    raise exception 'Tipo de movimiento invalido';
  end if;
  v_movement_type := p_type::public.stock_movement_type;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Indica el motivo del ajuste';
  end if;

  if p_quantity_delta = 0 then
    raise exception 'La cantidad no puede ser cero';
  end if;

  select b.event_id, e.organization_id into v_event_id, v_organization_id
  from public.bars b join public.events e on e.id = b.event_id
  where b.id = p_bar_id;

  if not found then
    raise exception 'La barra no existe';
  end if;

  if not public.is_platform_admin() and not public.cp_org_has_stock_access(v_organization_id) then
    raise exception 'La organizacion no tiene acceso al modulo de stock.';
  end if;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = v_organization_id and om.user_id = auth.uid()
      and om.role = 'organizer' and om.status = 'active'
  ) then
    raise exception 'No tenes permiso para administrar el stock de este evento';
  end if;

  -- Un ajuste positivo no puede dejar mas stock repartido entre barras del
  -- que la organizacion cargo como total comprado para este producto.
  if p_quantity_delta > 0 then
    select total_stock into v_total_stock from public.event_products where id = p_event_product_id;
    select coalesce(sum(quantity), 0) into v_total_across_bars
    from public.bar_stock where event_product_id = p_event_product_id;

    if v_total_across_bars + p_quantity_delta > v_total_stock then
      raise exception 'El ajuste superaria el stock total comprado (%). Ya hay % repartido en barras.', v_total_stock, v_total_across_bars;
    end if;
  end if;

  select quantity into v_current from public.bar_stock
  where bar_id = p_bar_id and event_product_id = p_event_product_id
  for update;

  if not found then
    v_current := 0;
    insert into public.bar_stock (bar_id, event_product_id, quantity) values (p_bar_id, p_event_product_id, 0);
  end if;

  if v_current + p_quantity_delta < 0 then
    raise exception 'El ajuste dejaria el stock en negativo. Stock actual: %', v_current;
  end if;

  update public.bar_stock set quantity = v_current + p_quantity_delta, updated_at = now()
  where bar_id = p_bar_id and event_product_id = p_event_product_id;

  insert into public.stock_movements (event_id, event_product_id, bar_id, type, quantity, reason, actor_user_id)
  values (v_event_id, p_event_product_id, p_bar_id, v_movement_type, abs(p_quantity_delta), p_reason, auth.uid());
end;
$$;
revoke all on function public.adjust_bar_stock(uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.adjust_bar_stock(uuid, uuid, integer, text, text) to authenticated;

commit;
