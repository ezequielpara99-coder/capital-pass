-- Bug real encontrado en una ronda de auditoria sobre stock/carta: bajar
-- total_stock de un producto ya cargado en un evento chequeaba "no bajes
-- de lo ya repartido en barras" y despues hacia el upsert en dos consultas
-- separadas, sin ningun lock -- exactamente el mismo problema que
-- adjust_bar_stock ya habia arreglado (20260946) tomando "for update of
-- ep" sobre event_products. Sin el lock, una baja de total_stock y una
-- asignacion a una barra casi simultaneas podian pasar juntas sus propios
-- chequeos y dejar mas repartido en barras que el total comprado.
begin;

create or replace function public.cp_upsert_event_product(
  p_event_id uuid,
  p_product_id uuid,
  p_cost_price_minor integer,
  p_sale_price_minor integer,
  p_profit_margin_percent numeric,
  p_total_stock integer,
  p_low_stock_threshold integer
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_assigned_total integer;
begin
  select ep.id into v_id
  from public.event_products ep
  where ep.event_id = p_event_id and ep.product_id = p_product_id
  for update of ep;

  if found then
    select coalesce(sum(bs.quantity), 0) into v_assigned_total
    from public.bar_stock bs where bs.event_product_id = v_id;

    if p_total_stock < v_assigned_total then
      raise exception 'No podés bajar el stock total a menos de lo ya repartido en barras (%).', v_assigned_total;
    end if;

    update public.event_products set
      cost_price_minor = p_cost_price_minor,
      sale_price_minor = p_sale_price_minor,
      profit_margin_percent = p_profit_margin_percent,
      total_stock = p_total_stock,
      low_stock_threshold = p_low_stock_threshold,
      updated_at = now()
    where event_products.id = v_id;

    return v_id;
  end if;

  insert into public.event_products (event_id, product_id, cost_price_minor, sale_price_minor, profit_margin_percent, total_stock, low_stock_threshold)
  values (p_event_id, p_product_id, p_cost_price_minor, p_sale_price_minor, p_profit_margin_percent, p_total_stock, p_low_stock_threshold)
  returning event_products.id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.cp_upsert_event_product(uuid, uuid, integer, integer, numeric, integer, integer) from public, anon, authenticated;
grant execute on function public.cp_upsert_event_product(uuid, uuid, integer, integer, numeric, integer, integer) to service_role;

commit;

notify pgrst, 'reload schema';
