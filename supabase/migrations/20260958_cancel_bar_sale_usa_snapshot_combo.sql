-- Bug real encontrado en revision: cancel_bar_sale (20260941) restaura el
-- saldo de combo de una entrada leyendo combo_type EN VIVO de la tanda
-- (join a ticket_types), no el snapshot de la propia entrada
-- (tickets.combo_type, agregado despues por 20260953 -- esa migracion
-- arreglo el mismo problema en redeem_combo_ticket pero no toco
-- cancel_bar_sale, que se quedo con el join viejo).
--
-- Si el organizador edita el combo de una tanda (cambia el producto
-- incluido, o lo desactiva) DESPUES de que un bartender ya canjeo un
-- combo de una entrada vendida con la configuracion anterior, y
-- despues esa venta de barra se cancela (por ejemplo el bartender
-- entrego el producto equivocado), cancel_bar_sale lee el combo_type
-- NUEVO de la tanda -- si es null, ninguna rama del if se ejecuta y el
-- saldo de la entrada nunca se restaura; si cambio de tipo, se
-- incrementa el campo equivocado (combo_remaining_credit_minor en vez
-- de combo_remaining_quantity, o viceversa). El stock de la barra si
-- se restaura siempre (esa parte no depende de combo_type), pero el
-- cliente pierde en silencio la parte del combo que ya habia pagado.
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

    -- Devolverle a la entrada lo que redeem_combo_ticket le habia
    -- descontado -- leyendo el SNAPSHOT de la propia entrada
    -- (tickets.combo_type), no la configuracion en vivo de la tanda.
    if v_sale.ticket_id is not null then
      select t.combo_type into v_combo_type
      from public.tickets t
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
