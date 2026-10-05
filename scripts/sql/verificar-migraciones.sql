-- Verifica que migraciones de supabase/migrations ya estan aplicadas en la
-- base real. Solo lee (no cambia nada). Correr en el SQL Editor de
-- Supabase: cada fila dice ok o FALTA. Las que digan FALTA hay que
-- correrlas EN ORDEN (de la mas vieja a la mas nueva).
--
-- Cada chequeo busca algo que solo esa migracion deja en la base (una
-- columna, una tabla o un pedazo del codigo de una funcion que ninguna
-- migracion posterior volvio a reescribir). Las migraciones cuyo contenido
-- fue reemplazado entero por una posterior no se listan.
select migracion, case when aplicada then 'ok' else 'FALTA' end as estado
from (values
  ('20260966_capital_finanzas_base', to_regclass('public.quote_payments') is not null),
  ('20260967_catalogo_historial_precios', to_regclass('public.quote_catalog_price_history') is not null),
  ('20260968_packs_mensuales', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quotes' and column_name = 'monthly_pack_id')),
  ('20260969_cierre_mensual', to_regclass('public.monthly_closures') is not null),
  ('20260970_fix_email_entrada_online_y_recibos_duplicados', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sales' and column_name = 'ticket_email_sent_at')),
  ('20260971_sistema_traslados', to_regclass('public.transfer_routes') is not null),
  ('20260972_membresia_premium', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'organizations' and column_name = 'premium_memberships_enabled')),
  ('20260973_carnet_socio_premium', to_regclass('public.premium_member_scans') is not null),
  ('20260974_lista_negra', to_regclass('public.blacklist_entries') is not null),
  ('20260975_billetera_socio', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'premium_members' and column_name = 'balance_minor')),
  ('20260976_idempotencia_pagos_gastos', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quote_payments' and column_name = 'idempotency_key')),
  ('20260977_recordatorio_cobros', to_regclass('public.payment_reminders_log') is not null),
  ('20260978_metas_y_buscador', to_regclass('public.finance_goals') is not null),
  ('20260979_soft_delete_capital', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quotes' and column_name = 'deleted_at')),
  ('20260980_calendario_rental', to_regclass('public.rental_assets') is not null),
  ('20260982_app_socio', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'member_checkin_award' and position('select organization_id, status, expires_at into v_org_id, v_status, v_expires' in p.prosrc) > 0)),
  ('20260983_ranking_socios', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'organizations' and column_name = 'member_ranking_enabled')),
  ('20260984_recarga_saldo', to_regclass('public.wallet_topups') is not null),
  ('20260985_premio_mensual', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'member_ranking' and position('select member_ranking_enabled,' in p.prosrc) > 0)),
  ('20260986_seguimiento_colectivo', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transfer_tickets' and column_name = 'stop_id')),
  ('20260987_avisos_socio', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'transfer_claim_notifications' and position('select * into v_route from public.transfer_routes where id = p_route_id and deleted_at is null and active = true;' in p.prosrc) > 0)),
  ('20260988_pedidos_completos', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'member_level_info' and position('select organization_id into v_org from public.premium_members where id = p_member_id and deleted_at is null;' in p.prosrc) > 0)),
  ('20260989_mesas_online', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'cp_sale_table_sync' and position('-- Venta cancelada o reembolsada: la mesa vuelve a estar disponible.' in p.prosrc) > 0)),
  ('20260990_sales_agent', to_regclass('public.prospect_campaigns') is not null),
  ('20260991_arregla_stock_y_expiracion_pedidos_socio', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'member_place_order' and position('-- Se guarda a que evento pertenece el pedido DESDE que se crea (solo si' in p.prosrc) > 0)),
  ('20260992_arregla_duplicados_y_conversion_sales_agent', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'prospects' and column_name = 'phone_match_key')),
  ('20260993_arregla_colectivos_general_y_carreras', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'transfer_mark_stop' and position('-- Reiniciar el recorrido borra los avisos ya mandados (20260987): un' in p.prosrc) > 0)),
  ('20260994_arregla_finanzas_y_comisiones_rrpp', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'cp_quote_status_changed' and position('if new.status is distinct from old.status then' in p.prosrc) > 0)),
  ('20260995_arregla_idempotencia_compra_online_y_reapertura_tanda', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sale_items' and column_name = 'line_total_minor')),
  ('20260996_arregla_carrera_y_edicion_reservas_rental', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rental_create_booking' and position('if p_ends_on < p_starts_on then' in p.prosrc) > 0)),
  ('20260997_arregla_carrera_stock_total', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'cp_upsert_event_product' and position('where ep.event_id = p_event_id and ep.product_id = p_product_id' in p.prosrc) > 0)),
  ('20260998_bloquea_bajar_cupo_por_debajo_de_lo_vendido', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'cp_ticket_type_capacity_guard' and position('if new.capacity is not null and new.capacity is distinct from old.capacity then' in p.prosrc) > 0)),
  ('20261000_endurece_presencia_y_perfil', exists (select 1 from pg_constraint where conname = 'profiles_phone_length')),
  ('20261001_protege_presencia_de_organizadores', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'cp_protect_last_active_at' and position('new.last_active_at := old.last_active_at;' in p.prosrc) > 0)),
  ('20261002_qr_de_mesa', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'process_ticket_return' and position('select s.table_id into v_table_id from public.sales s where s.id = v_sale_id;' in p.prosrc) > 0)),
  ('20261005_arregla_pago_rechazado_tardio_y_permiso', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'confirm_online_sale' and position('-- volver a procesar una venta ya confirmada. Solo un reembolso o' in p.prosrc) > 0)),
  ('20261006_normaliza_email_comprador', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'cp_normalize_buyer_email')),
  ('20261007_seguimiento_envio_whatsapp', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sales' and column_name = 'whatsapp_sent_at')),
  ('20261008_bloquea_venta_online_evento_terminado', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_online_sale' and position('select e.organization_id, e.status, e.starts_at, e.ends_at' in p.prosrc) > 0)),
  ('20261009_arregla_colectivo_fuga_y_cancelacion', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_transfer_ticket' and position('-- El codigo de 6 caracteres no tiene firma (a diferencia del QR de' in p.prosrc) > 0)),
  ('20261010_arregla_combo_idempotente_stock_y_rate_limit_control', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'assign_stock_to_bar' and position('-- Suma EN VIVO de bar_stock (lo que realmente queda repartido en barras' in p.prosrc) > 0)),
  ('20261011_snapshot_cuenta_mp_venta_online', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_online_sale_charged_total' and position('mercadopago_collector_id = coalesce(p_mercadopago_collector_id, mercadopago_collector_id),' in p.prosrc) > 0)),
  ('20261012_mesa_genera_entrada_y_endurece_venta', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'sell_table' and position('-- Mismo limite que ya se le agrego a create_sale: ninguna de las dos' in p.prosrc) > 0)),
  ('20261013_arregla_permiso_update_sales', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'claim_ticket_email_sent' and position('update public.sales set ticket_email_sent_at = now(), updated_at = now()' in p.prosrc) > 0)),
  ('20261014_snapshot_cuenta_mp_recarga_socio', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wallet_topups' and column_name = 'mercadopago_collector_id')),
  ('20261015_verificacion_final_barra_y_colectivos', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'adjust_bar_stock' and position('-- Reintento de un ajuste que ya se aplico con exito (mismo caller, misma' in p.prosrc) > 0)),
  ('20261016_renovacion_anticipada_y_cobro_por_intento', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'cp_record_payment' and position('existing public.subscription_payments%rowtype;' in p.prosrc) > 0)),
  ('20261017_recargas_repetidas_y_mesas_de_socio', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'member_wallet_topup_apply' and position('v_other public.wallet_topups%rowtype;' in p.prosrc) > 0)),
  ('20261018_usuario_y_celular_para_ingresar', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'cp_login_email' and position('join auth.users u on u.id = p.id' in p.prosrc) > 0)),
  ('20261019_finanzas_fijos', to_regclass('public.finance_fixed_items') is not null)
) as m(migracion, aplicada)
order by migracion;
