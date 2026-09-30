-- Dos bugs reales de la ronda de auditoria de bartender/stock y panel de evento:
--
-- 1. create_bartender_sale validaba el gate equivocado (cp_org_has_service,
--    que solo exige una suscripcion base de Capital Pass) en vez de
--    cp_org_has_stock_access (que exige ademas que el modulo de stock no
--    este bloqueado y el plan/prueba de stock siga vigente) -- exactamente
--    el chequeo que SI usan assign_stock_to_bar, adjust_bar_stock y
--    redeem_combo_ticket en este mismo archivo de origen. Una organizacion
--    con la prueba de 7 dias de stock vencida, o a la que un admin le corto
--    el acceso a mano (organizations.stock_access_blocked), quedaba
--    bloqueada en el panel de administracion de stock pero podia seguir
--    vendiendo tragos sin limite desde /bartender.
--
-- 2. ticket_types.capacity no tenia ningun limite en la base (solo del lado
--    del cliente en React) -- un capacity NULL colaba sin querer entradas
--    ilimitadas: en PL/pgSQL "x > NULL" es NULL, y un "if NULL then" no
--    dispara, asi que el chequeo de cupo de confirm_online_sale/create_sale
--    (v_sold + cantidad > v_capacity) nunca frenaba nada. Mismo patron ya
--    arreglado para price_minor (20261002).
begin;

create or replace function public.create_bartender_sale(
  p_bar_id uuid, p_table_id uuid, p_event_product_id uuid, p_quantity integer, p_payment_method text,
  p_idempotency_key uuid default null
)
returns table(bar_sale_id uuid, total_minor bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_organization_id uuid;
  v_bartender_member_id uuid;
  v_sale_price bigint;
  v_total bigint;
  v_payment_method public.sale_payment_method;
  v_sale_id uuid;
  v_existing_total bigint;
begin
  if p_idempotency_key is not null then
    select bs.id, bs.total_minor into v_sale_id, v_existing_total
    from public.bar_sales bs where bs.idempotency_key = p_idempotency_key;
    if found then
      return query select v_sale_id, v_existing_total;
      return;
    end if;
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity > 50 then
    raise exception 'Cantidad invalida';
  end if;

  begin
    v_payment_method := p_payment_method::public.sale_payment_method;
  exception when invalid_text_representation then
    raise exception 'Indica si la venta fue en efectivo o transferencia';
  end;

  select b.event_id, e.organization_id into v_event_id, v_organization_id
  from public.bars b join public.events e on e.id = b.event_id
  where b.id = p_bar_id;

  if not found then
    raise exception 'La barra no existe';
  end if;

  if not public.is_platform_admin() and not public.cp_org_has_stock_access(v_organization_id) then
    raise exception 'La organizacion no tiene acceso al modulo de stock.';
  end if;

  select om.id into v_bartender_member_id
  from public.organization_members om
  join public.event_staff es on es.organization_member_id = om.id
  where om.organization_id = v_organization_id and om.user_id = auth.uid()
    and om.role = 'bartender' and om.status = 'active'
    and es.event_id = v_event_id and es.staff_role = 'bartender' and es.active = true
    and es.bar_id = p_bar_id
  limit 1;

  if v_bartender_member_id is null then
    raise exception 'No estas asignado a esta barra';
  end if;

  if p_table_id is not null and not exists (
    select 1 from public.bar_tables t where t.id = p_table_id and t.event_id = v_event_id
  ) then
    raise exception 'La mesa no existe para este evento';
  end if;

  select ep.sale_price_minor into v_sale_price
  from public.event_products ep where ep.id = p_event_product_id and ep.event_id = v_event_id;

  if not found then
    raise exception 'El producto no existe para este evento';
  end if;

  if not exists (
    select 1 from public.bar_stock where bar_id = p_bar_id and event_product_id = p_event_product_id
  ) then
    raise exception 'Este producto no esta asignado a esta barra';
  end if;

  v_total := v_sale_price * p_quantity;

  insert into public.bar_sales (event_id, bar_id, bartender_member_id, table_id, event_product_id, quantity, unit_price_minor, total_minor, payment_method, idempotency_key)
  values (v_event_id, p_bar_id, v_bartender_member_id, p_table_id, p_event_product_id, p_quantity, v_sale_price, v_total, v_payment_method, p_idempotency_key)
  returning id into v_sale_id;

  insert into public.stock_movements (event_id, event_product_id, bar_id, type, quantity, actor_user_id)
  values (v_event_id, p_event_product_id, p_bar_id, 'venta', p_quantity, auth.uid());

  return query select v_sale_id, v_total;
end;
$$;
revoke all on function public.create_bartender_sale(uuid, uuid, uuid, integer, text, uuid) from public, anon;
grant execute on function public.create_bartender_sale(uuid, uuid, uuid, integer, text, uuid) to authenticated;

alter table public.ticket_types drop constraint if exists ticket_types_capacity_positive;
alter table public.ticket_types add constraint ticket_types_capacity_positive check (capacity is not null and capacity > 0) not valid;
alter table public.ticket_types validate constraint ticket_types_capacity_positive;

commit;

notify pgrst, 'reload schema';
