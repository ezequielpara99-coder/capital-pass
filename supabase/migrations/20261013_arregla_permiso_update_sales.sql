-- Bug CRITICO encontrado probando en vivo el envio de entradas (a pedido
-- de Eze, con su propio celular y mail reales): el envio automatico de la
-- entrada por mail NUNCA funciono, ni en compra online (Mercado Pago) ni
-- en venta en persona -- SIEMPRE devolvia "omitido" aunque el comprador
-- tuviera email cargado.
--
-- Causa raiz: service_role NO tiene permiso de UPDATE directo sobre
-- public.sales (todas las mutaciones de ventas tienen que pasar por
-- funciones security definer, no por acceso directo a la tabla -- ver el
-- comentario de 20260918_total_charged.sql, que ya documentaba esta regla
-- para total_charged_minor). Pero 4 lugares del codigo la violaban,
-- haciendo un admin.from("sales").update(...) directo:
--
-- 1. lib/billing/server.ts (sendOnlineSaleTicketEmail) -- el reclamo
--    atomico antes de mandar el mail de una compra ONLINE real.
-- 2. app/api/ventas/[saleId]/enviar-email/route.ts -- el mismo reclamo
--    para venta en persona (puerta/RRPP/organizador/mesa).
-- 3. app/api/ventas/[saleId]/whatsapp-enviado/route.ts -- el reclamo de
--    "ya se mando por WhatsApp" (la base de la seccion "Entradas sin
--    enviar" de Notificaciones).
-- 4. app/api/e/[slug]/checkout/verificar/route.ts -- el cooldown de
--    "Verificar mi pago" (sin el, el freno contra spam a la cuota de
--    Mercado Pago tampoco funcionaba: last_reconciled_at nunca se guardaba).
--
-- En los 4 casos el UPDATE fallaba con "permission denied for table
-- sales" (42501) SIN que el codigo chequeara el error -- se interpretaba
-- como "ya estaba reclamado antes" y se abortaba en silencio, sin mandar
-- nunca el mail real ni guardar nunca la marca de enviado. Confirmado en
-- vivo: 2 de 2 ventas de prueba reales (con mail real) se saltearon el
-- envio automatico.
--
-- Mismo criterio que set_online_sale_charged_total (20260918): en vez de
-- otorgar un GRANT amplio de UPDATE sobre toda la tabla sales, se agregan
-- funciones chicas y acotadas para cada reclamo puntual.
begin;

create or replace function public.claim_ticket_email_sent(p_sale_id uuid, p_force boolean default false)
returns table(id uuid, event_id uuid, buyer_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if p_force then
    return query
      update public.sales set ticket_email_sent_at = now(), updated_at = now()
      where sales.id = p_sale_id
      returning sales.id, sales.event_id, sales.buyer_id;
    return;
  end if;

  return query
    update public.sales set ticket_email_sent_at = now(), updated_at = now()
    where sales.id = p_sale_id and sales.ticket_email_sent_at is null
    returning sales.id, sales.event_id, sales.buyer_id;
end;
$$;
revoke all on function public.claim_ticket_email_sent(uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_ticket_email_sent(uuid, boolean) to service_role;

create or replace function public.release_ticket_email_sent(p_sale_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.sales set ticket_email_sent_at = null, updated_at = now() where id = p_sale_id;
end;
$$;
revoke all on function public.release_ticket_email_sent(uuid) from public, anon, authenticated;
grant execute on function public.release_ticket_email_sent(uuid) to service_role;

create or replace function public.claim_whatsapp_sent(p_sale_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_updated integer;
begin
  update public.sales set whatsapp_sent_at = now(), updated_at = now()
  where id = p_sale_id and whatsapp_sent_at is null;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;
revoke all on function public.claim_whatsapp_sent(uuid) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_sent(uuid) to service_role;

create or replace function public.set_sale_last_reconciled(p_sale_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.sales set last_reconciled_at = now() where id = p_sale_id;
end;
$$;
revoke all on function public.set_sale_last_reconciled(uuid) from public, anon, authenticated;
grant execute on function public.set_sale_last_reconciled(uuid) to service_role;

commit;

notify pgrst, 'reload schema';
