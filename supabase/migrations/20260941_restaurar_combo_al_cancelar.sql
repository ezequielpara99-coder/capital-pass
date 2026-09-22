-- cancel_bar_sale ya restauraba bar_stock al cancelar un canje de combo,
-- pero no le devolvia a LA ENTRADA lo que se le habia descontado
-- (combo_remaining_quantity / combo_remaining_credit_minor). Resultado: si
-- el bartender se equivocaba de producto y el organizador cancelaba la
-- venta, el cliente perdia esa parte de lo que habia pagado -- quedaba
-- descontado de la entrada para siempre aunque el stock volviera.
begin;

create or replace function public.cancel_bar_sale(p_sale_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_sale public.bar_sales%rowtype;
  v_organization_id uuid;
  v_combo_type text;
begin
  select * into v_sale from public.bar_sales where id = p_sale_id for update;
  if not found then
    raise exception 'La venta no existe';
  end if;

  if v_sale.cancelled_at is not null then
    raise exception 'Esa venta ya estaba cancelada';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Indica el motivo de la cancelacion';
  end if;

  select e.organization_id into v_organization_id from public.events e where e.id = v_sale.event_id;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = v_organization_id and om.user_id = auth.uid()
      and om.role = 'organizer' and om.status = 'active'
  ) then
    raise exception 'No tenes permiso para cancelar ventas de este evento';
  end if;

  update public.bar_sales set cancelled_at = now(), cancel_reason = p_reason where id = p_sale_id;

  if v_sale.payment_method = 'combo' then
    update public.bar_stock set quantity = quantity + v_sale.quantity, updated_at = now()
    where bar_id = v_sale.bar_id and event_product_id = v_sale.event_product_id;

    insert into public.stock_movements (event_id, event_product_id, bar_id, type, quantity, reason, actor_user_id)
    values (v_sale.event_id, v_sale.event_product_id, v_sale.bar_id, 'ajuste', v_sale.quantity, 'Cancelacion de venta: ' || p_reason, auth.uid());

    -- Devolverle a la entrada lo que redeem_combo_ticket le habia descontado.
    if v_sale.ticket_id is not null then
      select tt.combo_type into v_combo_type
      from public.tickets t
      join public.ticket_types tt on tt.id = t.ticket_type_id
      where t.id = v_sale.ticket_id
      for update of t;

      if v_combo_type = 'producto' then
        update public.tickets set combo_remaining_quantity = coalesce(combo_remaining_quantity, 0) + v_sale.quantity, updated_at = now()
        where id = v_sale.ticket_id;
      elsif v_combo_type = 'credito' then
        update public.tickets set combo_remaining_credit_minor = coalesce(combo_remaining_credit_minor, 0) + v_sale.total_minor, updated_at = now()
        where id = v_sale.ticket_id;
      end if;
    end if;
  end if;
end;
$$;
revoke all on function public.cancel_bar_sale(uuid, text) from public, anon;
grant execute on function public.cancel_bar_sale(uuid, text) to authenticated;

commit;

notify pgrst, 'reload schema';
