import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

type Row = { seccion: string; objeto: string; detalle: unknown };
const fixture = JSON.parse(readFileSync(new URL("./schema.fixture.json", import.meta.url), "utf8")) as Row[];
const migration = readFileSync(new URL("../supabase/migrations/20260913_account_before_payment.sql", import.meta.url), "utf8");
const checkoutProMigration = readFileSync(new URL("../supabase/migrations/20260916_checkout_pro.sql", import.meta.url), "utf8");
const onlineSalesMigration = readFileSync(new URL("../supabase/migrations/20260917_ventas_online.sql", import.meta.url), "utf8");
const totalChargedMigration = readFileSync(new URL("../supabase/migrations/20260918_total_charged.sql", import.meta.url), "utf8");
const itemsReturnMigration = readFileSync(new URL("../supabase/migrations/20260919_online_sale_items_return.sql", import.meta.url), "utf8");
const paymentMethodMigration = readFileSync(new URL("../supabase/migrations/20260920_metodo_pago_venta.sql", import.meta.url), "utf8");
const stockMigration = readFileSync(new URL("../supabase/migrations/20260921_stock_barras_bartenders_mesas.sql", import.meta.url), "utf8");
const barraSinMesaMigration = readFileSync(new URL("../supabase/migrations/20260922_venta_barra_sin_mesa.sql", import.meta.url), "utf8");
const productAssetsMigration = readFileSync(new URL("../supabase/migrations/20260923_product_assets_bucket.sql", import.meta.url), "utf8");
const perfilReclamosMigration = readFileSync(new URL("../supabase/migrations/20260924_perfil_reclamos_cancelaciones.sql", import.meta.url), "utf8");
const pushNotificationsMigration = readFileSync(new URL("../supabase/migrations/20260925_notificaciones_push.sql", import.meta.url), "utf8");
const planAvanzadoTrialMigration = readFileSync(new URL("../supabase/migrations/20260926_plan_avanzado_trial_stock.sql", import.meta.url), "utf8");
const capitalRentalsMigration = readFileSync(new URL("../supabase/migrations/20260927_capital_rentals.sql", import.meta.url), "utf8");
const trialAlUsarStockMigration = readFileSync(new URL("../supabase/migrations/20260928_trial_arranca_al_usar_stock.sql", import.meta.url), "utf8");
const upgradePlanDiferenciaMigration = readFileSync(new URL("../supabase/migrations/20260929_upgrade_plan_diferencia.sql", import.meta.url), "utf8");
const adminBypassStockTrialMigration = readFileSync(new URL("../supabase/migrations/20260930_admin_bypass_stock_trial.sql", import.meta.url), "utf8");
const fixUpgradeProrationMigration = readFileSync(new URL("../supabase/migrations/20260931_fix_upgrade_proration_bugs.sql", import.meta.url), "utf8");
const fixOnlineSaleStaleCashMigration = readFileSync(new URL("../supabase/migrations/20260932_fix_online_sale_stale_cash_payment.sql", import.meta.url), "utf8");
const capPositiveStockAdjustmentMigration = readFileSync(new URL("../supabase/migrations/20260933_cap_positive_stock_adjustment.sql", import.meta.url), "utf8");
const combosYPacksMigration = readFileSync(new URL("../supabase/migrations/20260934_combos_y_packs.sql", import.meta.url), "utf8");
const tragoNoDescuentaStockMigration = readFileSync(new URL("../supabase/migrations/20260935_venta_trago_no_descuenta_stock.sql", import.meta.url), "utf8");
const cuentasCortesiaMigration = readFileSync(new URL("../supabase/migrations/20260936_cuentas_cortesia.sql", import.meta.url), "utf8");
const colorEntradaMigration = readFileSync(new URL("../supabase/migrations/20260937_color_entrada.sql", import.meta.url), "utf8");
const presupuestosMigration = readFileSync(new URL("../supabase/migrations/20260938_presupuestos.sql", import.meta.url), "utf8");
const bloquearStockMigration = readFileSync(new URL("../supabase/migrations/20260939_bloquear_stock.sql", import.meta.url), "utf8");
const presenciaMigration = readFileSync(new URL("../supabase/migrations/20260940_presencia_organizadores.sql", import.meta.url), "utf8");
const restaurarComboMigration = readFileSync(new URL("../supabase/migrations/20260941_restaurar_combo_al_cancelar.sql", import.meta.url), "utf8");
const packsOnlineMigration = readFileSync(new URL("../supabase/migrations/20260942_packs_online.sql", import.meta.url), "utf8");
const presupuestosClientesMigration = readFileSync(new URL("../supabase/migrations/20260943_presupuestos_clientes.sql", import.meta.url), "utf8");
const estadosYPaquetesMigration = readFileSync(new URL("../supabase/migrations/20260944_estados_y_paquetes.sql", import.meta.url), "utf8");
const notasEnPaquetesMigration = readFileSync(new URL("../supabase/migrations/20260945_notas_en_paquetes.sql", import.meta.url), "utf8");
const correccionesRevisionMigration = readFileSync(new URL("../supabase/migrations/20260946_correcciones_revision.sql", import.meta.url), "utf8");
// 20260947 no se aplica aca: ticket_delivery_attempts no existe en el
// harness de tests (igual que otras tablas del esquema base no trackeado).
const stockAccessMembresiaMigration = readFileSync(new URL("../supabase/migrations/20260948_cp_org_has_stock_access_membresia.sql", import.meta.url), "utf8");
// 20260949 (cooldown de verificar) y 20260950 (rate limiting) no se
// aplican aca: son endpoints HTTP publicos que no se prueban por RPC
// directa, sin ninguna funcion de este harness que dependa de ellas.
const idempotenciaBarraMigration = readFileSync(new URL("../supabase/migrations/20260951_idempotencia_venta_barra.sql", import.meta.url), "utf8");
const indicesMigration = readFileSync(new URL("../supabase/migrations/20260952_indices_columnas_calientes.sql", import.meta.url), "utf8");
const comboSnapshotMigration = readFileSync(new URL("../supabase/migrations/20260953_combo_snapshot_por_entrada.sql", import.meta.url), "utf8");
const idempotenciaCreateSaleMigration = readFileSync(new URL("../supabase/migrations/20260954_idempotencia_create_sale.sql", import.meta.url), "utf8");
const adminDashboardTotalsMigration = readFileSync(new URL("../supabase/migrations/20260956_admin_dashboard_totales_reales.sql", import.meta.url), "utf8");
const migracionesRecuperadasMigration = readFileSync(new URL("../supabase/migrations/20260957_recupera_migraciones_nunca_aplicadas.sql", import.meta.url), "utf8");
const cancelBarSaleSnapshotMigration = readFileSync(new URL("../supabase/migrations/20260958_cancel_bar_sale_usa_snapshot_combo.sql", import.meta.url), "utf8");
const validateTicketMethodMigration = readFileSync(new URL("../supabase/migrations/20260959_validate_ticket_manual_method_offline.sql", import.meta.url), "utf8");
const confirmOnlineSaleAcumulaCupoMigration = readFileSync(new URL("../supabase/migrations/20260960_confirm_online_sale_acumula_cupo_por_tanda.sql", import.meta.url), "utf8");
const snapshotComisionRrppMigration = readFileSync(new URL("../supabase/migrations/20260961_snapshot_comision_rrpp.sql", import.meta.url), "utf8");
const processTicketReturnMigration = readFileSync(new URL("../supabase/migrations/20260962_process_ticket_return_sin_race_de_combo.sql", import.meta.url), "utf8");
const cpPrepareCheckoutRespetaPlanMigration = readFileSync(new URL("../supabase/migrations/20260963_cp_prepare_checkout_respeta_plan_elegido.sql", import.meta.url), "utf8");
const evitaSpamPushSuscripcionMigration = readFileSync(new URL("../supabase/migrations/20260964_evita_spam_push_nueva_suscripcion.sql", import.meta.url), "utf8");
const idempotenciaVentaMesaMigration = readFileSync(new URL("../supabase/migrations/20260965_idempotencia_venta_mesa.sql", import.meta.url), "utf8");
const capitalFinanzasBaseMigration = readFileSync(new URL("../supabase/migrations/20260966_capital_finanzas_base.sql", import.meta.url), "utf8");
const catalogoHistorialPreciosMigration = readFileSync(new URL("../supabase/migrations/20260967_catalogo_historial_precios.sql", import.meta.url), "utf8");
const packsMensualesMigration = readFileSync(new URL("../supabase/migrations/20260968_packs_mensuales.sql", import.meta.url), "utf8");
const cierreMensualMigration = readFileSync(new URL("../supabase/migrations/20260969_cierre_mensual.sql", import.meta.url), "utf8");
const fixEmailEntradaOnlineMigration = readFileSync(new URL("../supabase/migrations/20260970_fix_email_entrada_online_y_recibos_duplicados.sql", import.meta.url), "utf8");
const sistemaTrasladosMigration = readFileSync(new URL("../supabase/migrations/20260971_sistema_traslados.sql", import.meta.url), "utf8");
const membresiaPremiumMigration = readFileSync(new URL("../supabase/migrations/20260972_membresia_premium.sql", import.meta.url), "utf8");
const carnetSocioPremiumMigration = readFileSync(new URL("../supabase/migrations/20260973_carnet_socio_premium.sql", import.meta.url), "utf8");
const listaNegraMigration = readFileSync(new URL("../supabase/migrations/20260974_lista_negra.sql", import.meta.url), "utf8");
const billeteraSocioMigration = readFileSync(new URL("../supabase/migrations/20260975_billetera_socio.sql", import.meta.url), "utf8");
const idempotenciaPagosGastosMigration = readFileSync(new URL("../supabase/migrations/20260976_idempotencia_pagos_gastos.sql", import.meta.url), "utf8");
const recordatorioCobrosMigration = readFileSync(new URL("../supabase/migrations/20260977_recordatorio_cobros.sql", import.meta.url), "utf8");
const metasMigration = readFileSync(new URL("../supabase/migrations/20260978_metas_y_buscador.sql", import.meta.url), "utf8");
const softDeleteMigration = readFileSync(new URL("../supabase/migrations/20260979_soft_delete_capital.sql", import.meta.url), "utf8");
const calendarioRentalMigration = readFileSync(new URL("../supabase/migrations/20260980_calendario_rental.sql", import.meta.url), "utf8");
const softDeleteRpcFixesMigration = readFileSync(new URL("../supabase/migrations/20260981_soft_delete_rpc_fixes.sql", import.meta.url), "utf8");
const appSocioMigration = readFileSync(new URL("../supabase/migrations/20260982_app_socio.sql", import.meta.url), "utf8");
const rankingSociosMigration = readFileSync(new URL("../supabase/migrations/20260983_ranking_socios.sql", import.meta.url), "utf8");
const recargaSaldoMigration = readFileSync(new URL("../supabase/migrations/20260984_recarga_saldo.sql", import.meta.url), "utf8");
const premioMensualMigration = readFileSync(new URL("../supabase/migrations/20260985_premio_mensual.sql", import.meta.url), "utf8");
const seguimientoColectivoMigration = readFileSync(new URL("../supabase/migrations/20260986_seguimiento_colectivo.sql", import.meta.url), "utf8");
const avisosSocioMigration = readFileSync(new URL("../supabase/migrations/20260987_avisos_socio.sql", import.meta.url), "utf8");
const pedidosCompletosMigration = readFileSync(new URL("../supabase/migrations/20260988_pedidos_completos.sql", import.meta.url), "utf8");
const mesasOnlineMigration = readFileSync(new URL("../supabase/migrations/20260989_mesas_online.sql", import.meta.url), "utf8");
const salesAgentMigration = readFileSync(new URL("../supabase/migrations/20260990_sales_agent.sql", import.meta.url), "utf8");
const arreglaStockYExpiracionMigration = readFileSync(new URL("../supabase/migrations/20260991_arregla_stock_y_expiracion_pedidos_socio.sql", import.meta.url), "utf8");
const arreglaDuplicadosSalesAgentMigration = readFileSync(new URL("../supabase/migrations/20260992_arregla_duplicados_y_conversion_sales_agent.sql", import.meta.url), "utf8");
const arreglaColectivosGeneralMigration = readFileSync(new URL("../supabase/migrations/20260993_arregla_colectivos_general_y_carreras.sql", import.meta.url), "utf8");
const arreglaFinanzasComisionesMigration = readFileSync(new URL("../supabase/migrations/20260994_arregla_finanzas_y_comisiones_rrpp.sql", import.meta.url), "utf8");
const arreglaIdempotenciaCompraOnlineMigration = readFileSync(new URL("../supabase/migrations/20260995_arregla_idempotencia_compra_online_y_reapertura_tanda.sql", import.meta.url), "utf8");
const arreglaCarreraRentalMigration = readFileSync(new URL("../supabase/migrations/20260996_arregla_carrera_y_edicion_reservas_rental.sql", import.meta.url), "utf8");
const arreglaCarreraStockTotalMigration = readFileSync(new URL("../supabase/migrations/20260997_arregla_carrera_stock_total.sql", import.meta.url), "utf8");
const bloqueaCupoMigration = readFileSync(new URL("../supabase/migrations/20260998_bloquea_bajar_cupo_por_debajo_de_lo_vendido.sql", import.meta.url), "utf8");
const endurecePresenciaPerfilMigration = readFileSync(new URL("../supabase/migrations/20261000_endurece_presencia_y_perfil.sql", import.meta.url), "utf8");
const protegePresenciaMigration = readFileSync(new URL("../supabase/migrations/20261001_protege_presencia_de_organizadores.sql", import.meta.url), "utf8");
const arreglaCarreraCreateSaleMigration = readFileSync(new URL("../supabase/migrations/20260999_arregla_carrera_idempotencia_create_sale.sql", import.meta.url), "utf8");
const qrDeMesaMigration = readFileSync(new URL("../supabase/migrations/20261002_qr_de_mesa.sql", import.meta.url), "utf8");
const arreglaGateBarraCupoMigration = readFileSync(new URL("../supabase/migrations/20261003_arregla_gate_barra_y_cupo_tanda.sql", import.meta.url), "utf8");
const arreglaPagoRechazadoTardioMigration = readFileSync(new URL("../supabase/migrations/20261005_arregla_pago_rechazado_tardio_y_permiso.sql", import.meta.url), "utf8");
const normalizaEmailCompradorMigration = readFileSync(new URL("../supabase/migrations/20261006_normaliza_email_comprador.sql", import.meta.url), "utf8");
const seguimientoEnvioWhatsappMigration = readFileSync(new URL("../supabase/migrations/20261007_seguimiento_envio_whatsapp.sql", import.meta.url), "utf8");
const bloqueaVentaEventoTerminadoMigration = readFileSync(new URL("../supabase/migrations/20261008_bloquea_venta_online_evento_terminado.sql", import.meta.url), "utf8");
const arreglaColectivoFugaCancelacionMigration = readFileSync(new URL("../supabase/migrations/20261009_arregla_colectivo_fuga_y_cancelacion.sql", import.meta.url), "utf8");
const arreglaComboStockRateLimitMigration = readFileSync(new URL("../supabase/migrations/20261010_arregla_combo_idempotente_stock_y_rate_limit_control.sql", import.meta.url), "utf8");
const snapshotCuentaMpVentaOnlineMigration = readFileSync(new URL("../supabase/migrations/20261011_snapshot_cuenta_mp_venta_online.sql", import.meta.url), "utf8");
const mesaGeneraEntradaMigration = readFileSync(new URL("../supabase/migrations/20261012_mesa_genera_entrada_y_endurece_venta.sql", import.meta.url), "utf8");
const arreglaPermisoUpdateSalesMigration = readFileSync(new URL("../supabase/migrations/20261013_arregla_permiso_update_sales.sql", import.meta.url), "utf8");
const snapshotCuentaMpRecargaMigration = readFileSync(new URL("../supabase/migrations/20261014_snapshot_cuenta_mp_recarga_socio.sql", import.meta.url), "utf8");
const verificacionFinalBarraColectivosMigration = readFileSync(new URL("../supabase/migrations/20261015_verificacion_final_barra_y_colectivos.sql", import.meta.url), "utf8");
const renovacionAnticipadaMigration = readFileSync(new URL("../supabase/migrations/20261016_renovacion_anticipada_y_cobro_por_intento.sql", import.meta.url), "utf8");
const recargasRepetidasMesasSocioMigration = readFileSync(new URL("../supabase/migrations/20261017_recargas_repetidas_y_mesas_de_socio.sql", import.meta.url), "utf8");
const usuarioCelularIngresarMigration = readFileSync(new URL("../supabase/migrations/20261018_usuario_y_celular_para_ingresar.sql", import.meta.url), "utf8");
const finanzasFijosMigration = readFileSync(new URL("../supabase/migrations/20261019_finanzas_fijos.sql", import.meta.url), "utf8");
const qrVentasAnuladasMigration = readFileSync(new URL("../supabase/migrations/20261020_qr_de_ventas_anuladas.sql", import.meta.url), "utf8");
const comisionRrppMesaMigration = readFileSync(new URL("../supabase/migrations/20261021_comision_rrpp_por_mesa.sql", import.meta.url), "utf8");
const ingresoCelularCon15Migration = readFileSync(new URL("../supabase/migrations/20261022_ingreso_celular_con_15.sql", import.meta.url), "utf8");
const estadoAutomaticoEventosMigration = readFileSync(new URL("../supabase/migrations/20261023_estado_automatico_eventos.sql", import.meta.url), "utf8");
const q = (v: string) => '"' + v.replaceAll('"', '""') + '"';
const str = (v: string) => "'" + v.replaceAll("'", "''") + "'";

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.role() to anon, authenticated, service_role;`);
  for (const row of fixture.filter((r) => r.seccion === "tipos_enum")) {
    await db.exec(`create type public.${q(row.objeto)} as enum (${(row.detalle as string[]).map(str).join(",")})`);
  }
  for (const row of fixture.filter((r) => r.seccion === "columnas")) {
    const cols = row.detalle as { nombre: string; tipo: string; nullable: string; default: string | null }[];
    await db.exec(`create table public.${q(row.objeto)} (${cols.map((c) => `${q(c.nombre)} ${q(c.tipo)} ${c.nullable === "NO" ? "not null" : ""} ${c.default ? `default ${c.default}` : ""}`).join(",")})`);
  }
  const constraints = fixture.filter((r) => r.seccion === "restricciones").flatMap((r) =>
    (r.detalle as { nombre: string; definicion: string }[]).map((c) => ({ ...c, table: r.objeto })));
  constraints.sort((a, b) => Number(a.definicion.startsWith("FOREIGN")) - Number(b.definicion.startsWith("FOREIGN")));
  for (const c of constraints) {
    await db.exec(`alter table public.${q(c.table)} add constraint ${q(c.nombre)} ${c.definicion}`);
  }
  await db.exec(`create table events(id uuid primary key, organization_id uuid, name text, status public.event_status,
      starts_at timestamptz, ends_at timestamptz,
      rrpp_sales_enabled boolean default true, rrpp_sales_cutoff_at timestamptz,
      door_sales_enabled boolean default true, door_sales_start_at timestamptz, door_sales_end_at timestamptz);
    create table event_staff(id uuid primary key default gen_random_uuid(), event_id uuid, organization_member_id uuid, staff_role public.event_staff_role, active boolean, commission_percentage numeric);
    create table sales(id uuid primary key default gen_random_uuid(), organization_id uuid, event_id uuid, buyer_id uuid,
      seller_member_id uuid, status public.sale_status default 'confirmed', total_minor bigint default 0, currency text default 'ARS',
      channel public.sale_channel default 'organizer', confirmed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
    create table buyers(id uuid primary key default gen_random_uuid(), organization_id uuid, first_name text, last_name text, dni text, phone text, email text);
    create table ticket_types(id uuid primary key default gen_random_uuid(), event_id uuid, name text, price_minor bigint default 0,
      currency text default 'ARS', capacity integer, active boolean default true, status public.ticket_type_status default 'available',
      sales_start_at timestamptz, sales_end_at timestamptz, updated_at timestamptz default now());
    create table sale_items(id uuid primary key default gen_random_uuid(), sale_id uuid, event_id uuid, ticket_type_id uuid,
      quantity integer, unit_price_minor bigint);
    create table tickets(id uuid primary key default gen_random_uuid(), sale_item_id uuid, sale_id uuid, event_id uuid,
      ticket_type_id uuid, status public.ticket_status default 'issued', display_number integer, manual_code text,
      used_at timestamptz, updated_at timestamptz default now());
    create table audit_logs(id uuid primary key default gen_random_uuid(), actor_user_id uuid, organization_id uuid,
      event_id uuid, action text, entity_type text, entity_id uuid, metadata jsonb, created_at timestamptz default now());
    create table ticket_returns(id uuid primary key default gen_random_uuid(), organization_id uuid, event_id uuid, sale_id uuid,
      ticket_id uuid unique, reason text, refund_status text, refund_amount_minor bigint, returned_by_profile_id uuid,
      returned_at timestamptz, refunded_at timestamptz, created_at timestamptz default now());
    create table entry_scans(id uuid primary key default gen_random_uuid(), event_id uuid, ticket_id uuid,
      controller_member_id uuid, method text, result text, input_hash text, scanned_at timestamptz default now());
    create function public.is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.platform_admins where user_id=auth.uid()) $$;`);
  for (const row of fixture.filter((r) => r.seccion === "funciones_de_acceso")) await db.exec((row.detalle as { definicion: string }).definicion);
  for (const row of fixture.filter((r) => r.seccion === "politicas")) {
    const d = row.detalle as { rls_activo: boolean; politicas: { nombre: string; tipo: string; comando: string; roles: string[]; using: string | null; check: string | null }[] };
    if (d.rls_activo) await db.exec(`alter table public.${q(row.objeto)} enable row level security`);
    for (const p of d.politicas) await db.exec(`create policy ${q(p.nombre)} on public.${q(row.objeto)} as ${p.tipo} for ${p.comando} to ${p.roles.map(q).join(",")}${p.using ? ` using (${p.using})` : ""}${p.check ? ` with check (${p.check})` : ""}`);
  }
  await db.exec("grant select on all tables in schema public to authenticated; grant all on all tables in schema public to service_role;");
  await db.exec(migration);
  await db.exec(checkoutProMigration);
  await db.exec(onlineSalesMigration);
  await db.exec(totalChargedMigration);
  await db.exec(itemsReturnMigration);
  await db.exec(paymentMethodMigration);
  await db.exec(stockMigration);
  await db.exec(barraSinMesaMigration);
  await db.exec(productAssetsMigration);
  await db.exec(perfilReclamosMigration);
  await db.exec(pushNotificationsMigration);
  await db.exec(planAvanzadoTrialMigration);
  await db.exec(capitalRentalsMigration);
  await db.exec(trialAlUsarStockMigration);
  await db.exec(upgradePlanDiferenciaMigration);
  await db.exec(adminBypassStockTrialMigration);
  await db.exec(fixUpgradeProrationMigration);
  await db.exec(fixOnlineSaleStaleCashMigration);
  await db.exec(capPositiveStockAdjustmentMigration);
  await db.exec(combosYPacksMigration);
  await db.exec(tragoNoDescuentaStockMigration);
  await db.exec(cuentasCortesiaMigration);
  await db.exec(colorEntradaMigration);
  await db.exec(presupuestosMigration);
  await db.exec(bloquearStockMigration);
  await db.exec(presenciaMigration);
  await db.exec(restaurarComboMigration);
  await db.exec(packsOnlineMigration);
  await db.exec(presupuestosClientesMigration);
  await db.exec(estadosYPaquetesMigration);
  await db.exec(notasEnPaquetesMigration);
  await db.exec(correccionesRevisionMigration);
  await db.exec(stockAccessMembresiaMigration);
  await db.exec(idempotenciaBarraMigration);
  await db.exec(indicesMigration);
  await db.exec(comboSnapshotMigration);
  await db.exec(idempotenciaCreateSaleMigration);
  await db.exec(adminDashboardTotalsMigration);
  await db.exec(migracionesRecuperadasMigration);
  await db.exec(cancelBarSaleSnapshotMigration);
  await db.exec(validateTicketMethodMigration);
  await db.exec(confirmOnlineSaleAcumulaCupoMigration);
  await db.exec(snapshotComisionRrppMigration);
  await db.exec(processTicketReturnMigration);
  await db.exec(cpPrepareCheckoutRespetaPlanMigration);
  await db.exec(evitaSpamPushSuscripcionMigration);
  await db.exec(idempotenciaVentaMesaMigration);
  await db.exec(capitalFinanzasBaseMigration);
  await db.exec(catalogoHistorialPreciosMigration);
  await db.exec(packsMensualesMigration);
  await db.exec(cierreMensualMigration);
  await db.exec(fixEmailEntradaOnlineMigration);
  await db.exec(sistemaTrasladosMigration);
  await db.exec(membresiaPremiumMigration);
  await db.exec(carnetSocioPremiumMigration);
  await db.exec(listaNegraMigration);
  await db.exec(billeteraSocioMigration);
  await db.exec(idempotenciaPagosGastosMigration);
  await db.exec(recordatorioCobrosMigration);
  await db.exec(metasMigration);
  await db.exec(softDeleteMigration);
  await db.exec(calendarioRentalMigration);
  await db.exec(softDeleteRpcFixesMigration);
  await db.exec(appSocioMigration);
  await db.exec(rankingSociosMigration);
  await db.exec(recargaSaldoMigration);
  await db.exec(premioMensualMigration);
  await db.exec(seguimientoColectivoMigration);
  await db.exec(avisosSocioMigration);
  await db.exec(pedidosCompletosMigration);
  await db.exec(mesasOnlineMigration);
  await db.exec(salesAgentMigration);
  await db.exec(arreglaStockYExpiracionMigration);
  await db.exec(arreglaDuplicadosSalesAgentMigration);
  await db.exec(arreglaColectivosGeneralMigration);
  await db.exec(arreglaFinanzasComisionesMigration);
  await db.exec(arreglaIdempotenciaCompraOnlineMigration);
  await db.exec(arreglaCarreraRentalMigration);
  await db.exec(arreglaCarreraStockTotalMigration);
  await db.exec(bloqueaCupoMigration);
  await db.exec(arreglaCarreraCreateSaleMigration);
  await db.exec(endurecePresenciaPerfilMigration);
  await db.exec(protegePresenciaMigration);
  await db.exec(qrDeMesaMigration);
  await db.exec(arreglaGateBarraCupoMigration);
  await db.exec(arreglaPagoRechazadoTardioMigration);
  await db.exec(normalizaEmailCompradorMigration);
  await db.exec(seguimientoEnvioWhatsappMigration);
  await db.exec(bloqueaVentaEventoTerminadoMigration);
  await db.exec(arreglaColectivoFugaCancelacionMigration);
  await db.exec(arreglaComboStockRateLimitMigration);
  await db.exec(snapshotCuentaMpVentaOnlineMigration);
  await db.exec(mesaGeneraEntradaMigration);
  await db.exec(arreglaPermisoUpdateSalesMigration);
  await db.exec(snapshotCuentaMpRecargaMigration);
  await db.exec(verificacionFinalBarraColectivosMigration);
  await db.exec(renovacionAnticipadaMigration);
  await db.exec(recargasRepetidasMesasSocioMigration);
  await db.exec(usuarioCelularIngresarMigration);
  await db.exec(finanzasFijosMigration);
  await db.exec(qrVentasAnuladasMigration);
  await db.exec(comisionRrppMesaMigration);
  await db.exec(ingresoCelularCon15Migration);
  await db.exec(estadoAutomaticoEventosMigration);
  return db;
}

test("migracion real: alta, cobro, RLS, repetidos, reembolsos y recuperacion", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const plan = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await db.exec(`insert into auth.users values ('${user}','owner@example.test',now(),'{"first_name":"Owner","last_name":"Test","organization_name":"Club"}');
    insert into auth.users values ('${other}','other@example.test',null,'{}');
    insert into subscription_plans(id,code,name,price_minor) values ('${plan}','monthly','Mensual',10000);`);
  await assert.rejects(() => db.query(`select cp_ensure_account('${other}')`), /Confirm/);
  const org = await scalar(`select cp_ensure_account('${user}')`);
  assert.equal(await scalar(`select cp_ensure_account('${user}')`), org);
  assert.equal(await scalar(`select count(*)::int from organizations`), 1);
  assert.equal(await scalar(`select cp_org_has_service('${org}')`), false);
  const signup = await scalar(`select cp_prepare_checkout('${user}', '${plan}')->>'id'`);
  assert.equal(await scalar(`select cp_prepare_checkout('${user}', '${plan}')->>'id'`), signup);
  assert.equal(await scalar(`select cp_lock_checkout('${signup}')`), true);
  assert.equal(await scalar(`select cp_lock_checkout('${signup}')`), false);
  await db.exec(`update subscription_signups set mp_status='authorized',mercadopago_preapproval_id='mp-test' where id='${signup}'; select cp_refresh_subscription('${signup}');`);
  assert.equal(await scalar(`select cp_org_has_service('${org}')`), false, "autorizar no acredita dinero");
  await db.exec(`select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`);
  assert.equal(await scalar("select count(*)::int from organization_members"), 0);
  await assert.rejects(() => db.query(`select cp_record_payment('${signup}','forged','approved',10000,'ARS',now(),now())`), /permission denied/);
  await assert.rejects(() => db.query(`select create_sale(gen_random_uuid(),gen_random_uuid(),1,'a','b','1','2',null)`), /suscripcion activa/);
  await db.exec("reset role;");
  await assert.rejects(() => db.query(`select cp_record_payment('${signup}','wrong','approved',100,'ARS',now(),now())`), /no coincide/);
  const paidAt = new Date(Date.now() - 3600000).toISOString();
  const updated = new Date().toISOString();
  await db.query("select cp_record_payment($1,'real','approved',10000,'ARS',$2,$3)", [signup, paidAt, updated]);
  assert.equal(await scalar(`select cp_org_has_service('${org}')`), true);
  const end = await scalar("select period_end::text from subscription_payments where payment_id='real'");
  await db.query("select cp_record_payment($1,'real','approved',10000,'ARS',$2,$3)", [signup, paidAt, updated]);
  assert.equal(await scalar("select period_end::text from subscription_payments where payment_id='real'"), end);
  assert.equal(await scalar("select count(*)::int from subscription_payments"), 1);
  await db.exec("set role authenticated;");
  assert.equal(await scalar("select count(*)::int from organization_members"), 1);
  assert.equal(await scalar(`select is_org_organizer('${org}')`), true);
  await db.exec("reset role;");
  await db.query("select cp_record_payment($1,'real','refunded',10000,'ARS',$2,$3)", [signup, paidAt, new Date(Date.now() + 1000).toISOString()]);
  await db.query("select cp_record_payment($1,'real','approved',10000,'ARS',$2,$3)", [signup, paidAt, updated]);
  assert.equal(await scalar(`select cp_org_has_service('${org}')`), false, "un webhook atrasado no revierte el reembolso");
  // Checkout Pro: una renovacion debe poder re-lockear el mismo signup aunque
  // ya tenga un mercadopago_preapproval_id (preference) de un pago anterior.
  await db.exec(`update subscription_signups set checkout_started_at = now() - interval '3 minutes' where id = '${signup}'`);
  assert.equal(await scalar(`select cp_lock_checkout('${signup}')`), true, "debe permitir re-lockear para renovar tras vencer");
  assert.equal(await scalar(`select cp_lock_checkout('${signup}')`), false, "el enfriamiento de 2 minutos sigue vigente");

  // cp_prepare_checkout con un plan DISTINTO al de la solicitud existente
  // (el servicio sigue sin estar activo por el reembolso de arriba) crea una
  // solicitud NUEVA con el plan elegido -- la vieja conserva su plan y su
  // monto, asi un link de pago viejo sigue verificando contra su propio monto.
  const planB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  await db.exec(`insert into subscription_plans(id,code,name,price_minor,currency,billing_interval) values ('${planB}','anual','Anual',90000,'ARS','yearly')`);
  const switched = await db.query<{ id: string; plan_id: string; expected_amount: string; expected_currency: string; frequency_months: number }>(
    `select id, plan_id, expected_amount, expected_currency, frequency_months from jsonb_to_record(cp_prepare_checkout('${user}', '${planB}')) as x(id uuid, plan_id uuid, expected_amount bigint, expected_currency text, frequency_months integer)`
  );
  assert.notEqual(switched.rows[0].id, signup, "crea una solicitud nueva en vez de reescribir la vieja");
  assert.equal(switched.rows[0].plan_id, planB, "el plan es el elegido, no el viejo");
  assert.equal(Number(switched.rows[0].expected_amount), 90000, "el monto a cobrar es el del plan nuevo");
  assert.equal(switched.rows[0].expected_currency, "ARS");
  assert.equal(switched.rows[0].frequency_months, 12, "anual = 12 meses, no el 1 del plan mensual anterior");
  assert.equal(Number(await scalar(`select expected_amount from subscription_signups where id = '${signup}'`)), 10000, "la solicitud vieja conserva su monto");

  // Reintentar con el MISMO plan nuevo es idempotente: devuelve la misma solicitud.
  assert.equal(await scalar(`select cp_prepare_checkout('${user}', '${planB}')->>'id'`), switched.rows[0].id);
  assert.equal(await scalar(`select cp_prepare_checkout('${user}', '${planB}')->>'plan_id'`), planB);

  await db.exec(`insert into subscription_signups(plan_id,first_name,last_name,organization_name,email,mercadopago_preapproval_id)
    values ('${plan}','Owner','Test','Club','OWNER@example.test','legacy-owner'), ('${plan}','Other','Test','Other','other@example.test','legacy-other');
    select cp_ensure_account('${user}');`);
  assert.equal(await scalar("select user_id::text from subscription_signups where mercadopago_preapproval_id='legacy-owner'"), user);
  assert.equal(await scalar("select user_id from subscription_signups where mercadopago_preapproval_id='legacy-other'"), null);
  await db.exec(`insert into platform_admins(user_id) values('${user}');`);
  assert.equal(await scalar(`select cp_org_has_service('${org}')`), true);
  await db.exec(migration);
  assert.equal(await scalar("select count(*)::int from subscription_payments"), 1, "reaplicar conserva el historial");
  await db.close();
});

test("ventas online: carrito, confirmacion, cupo y limpieza de pendientes", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const admin = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const org = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const event = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const ticketType = "11111111-1111-4111-8111-111111111111";
  const cart = (qty: number) => `'[{"ticket_type_id":"${ticketType}","quantity":${qty}}]'::jsonb`;
  const buyer = (n: string) => `'Comprador','${n}','30${n}','3462${n}',null`;

  await db.exec(`insert into auth.users values ('${admin}','admin@example.test',now(),'{}');
    insert into platform_admins(user_id) values ('${admin}');
    insert into organizations(id,name,slug) values ('${org}','Club','club');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into ticket_types(id,event_id,name,price_minor,capacity,active,status)
      values ('${ticketType}','${event}','General',5000,2,true,'available');
    select set_config('request.jwt.claim.sub','${admin}',false);`);

  // Sin conectar Mercado Pago todavia, el carrito debe rechazarse.
  await assert.rejects(
    () => db.query(`select * from create_online_sale('${event}', ${cart(1)}, ${buyer("111111")})`),
    /Mercado Pago/, "no debe permitir vender sin cuenta de MP conectada"
  );

  await db.exec(`insert into organization_mercadopago_accounts(organization_id,mp_user_id,access_token,refresh_token,expires_at)
    values ('${org}', 999, 'tok', 'ref', now() + interval '1 day');`);

  const created = await db.query<{ sale_id: string; items: unknown }>(
    `select sale_id, items from create_online_sale('${event}', ${cart(2)}, ${buyer("222222")})`
  );
  const sale = created.rows[0].sale_id;
  const returnedItems = created.rows[0].items as { ticket_type_id: string; name: string; quantity: number; unit_price_minor: number; line_total_minor: number; pack_id: string | null }[];
  assert.deepEqual(
    returnedItems,
    [{ ticket_type_id: ticketType, name: "General", quantity: 2, unit_price_minor: 5000, line_total_minor: 10000, pack_id: null }],
    "el detalle de items debe salir de la misma lectura que valida el cupo, no de una lectura aparte del caller"
  );
  assert.equal(await scalar(`select status from sales where id='${sale}'`), "pending_approval");
  assert.equal(await scalar(`select count(*)::int from tickets where sale_id='${sale}'`), 0, "no se emiten entradas hasta confirmar el pago");

  await db.query("select set_online_sale_charged_total($1, 5250, 999)", [sale]);
  assert.equal(await scalar(`select total_charged_minor::int from sales where id='${sale}'`), 5250, "guarda subtotal + cargo por servicio para verificar el pago despues");
  assert.equal(await scalar(`select mercadopago_collector_id::int from sales where id='${sale}'`), 999, "guarda que cuenta MP se uso para esta venta puntual");

  // El organizador reconecta Mercado Pago con OTRA cuenta mientras esta
  // venta sigue pendiente (organization_id es primary key: pisa la fila).
  // El snapshot ya guardado en la venta no tiene que cambiar -- es lo que
  // despues usa applySalePayment (lib/billing/server.ts) para verificar
  // contra que cuenta se cobro realmente, no contra la vigente ahora.
  await db.exec(`update organization_mercadopago_accounts set mp_user_id = 111 where organization_id = '${org}'`);
  assert.equal(await scalar(`select mercadopago_collector_id::int from sales where id='${sale}'`), 999, "reconectar Mercado Pago no pisa el snapshot de una venta ya en curso");

  // Un segundo carrito no puede reservar mas del cupo restante mientras el primero sigue pendiente.
  await assert.rejects(
    () => db.query(`select * from create_online_sale('${event}', ${cart(1)}, ${buyer("333333")})`),
    /No hay suficientes entradas/, "el cupo reservado por un carrito pendiente cuenta para otros compradores"
  );

  await db.query("select confirm_online_sale($1,'approved')", [sale]);
  assert.equal(await scalar(`select status from sales where id='${sale}'`), "confirmed");
  assert.equal(await scalar(`select count(*)::int from tickets where sale_id='${sale}'`), 2);
  assert.equal(await scalar(`select status from ticket_types where id='${ticketType}'`), "sold_out", "se agoto con las 2 entradas confirmadas");

  // Idempotencia: un reintento del webhook no debe duplicar entradas.
  await db.query("select confirm_online_sale($1,'approved')", [sale]);
  assert.equal(await scalar(`select count(*)::int from tickets where sale_id='${sale}'`), 2);

  await db.exec(`update ticket_types set status='available', capacity=10 where id='${ticketType}'`);

  // Un pago rechazado cancela la venta y no emite entradas.
  const rejectedSale = await scalar(`select sale_id::text from create_online_sale('${event}', ${cart(1)}, ${buyer("444444")})`);
  await db.query("select confirm_online_sale($1,'rejected')", [rejectedSale]);
  assert.equal(await scalar(`select status from sales where id='${rejectedSale}'`), "cancelled");
  assert.equal(await scalar(`select count(*)::int from tickets where sale_id='${rejectedSale}'`), 0);

  // Limpieza de carritos abandonados.
  const staleSale = await scalar(`select sale_id::text from create_online_sale('${event}', ${cart(1)}, ${buyer("555555")})`);
  await db.exec(`update sales set created_at = now() - interval '40 minutes' where id='${staleSale}'`);
  assert.equal(await scalar("select cp_cancel_stale_online_sales()"), 1);
  assert.equal(await scalar(`select status from sales where id='${staleSale}'`), "cancelled");

  // Un pago en efectivo que se acredita DESPUES de que el cron ya cancelo
  // el carrito por los 30 minutos (tipico de Pago Facil/Rapipago) no debe
  // perderse: si todavia hay cupo, la venta se revive en vez de quedar
  // cancelada para siempre con el comprador ya habiendo pagado.
  await db.query("select confirm_online_sale($1,'approved')", [staleSale]);
  assert.equal(await scalar(`select status from sales where id='${staleSale}'`), "confirmed", "el pago tardio revive la venta si hay cupo");
  assert.equal(await scalar(`select count(*)::int from tickets where sale_id='${staleSale}'`), 1);

  // Si en cambio el cupo ya se agoto para cuando llega el pago tardio
  // (otro comprador se quedo con los lugares mientras este esperaba),
  // no debe sobrevender: la venta queda cancelada, no se emiten entradas.
  // 3 entradas confirmadas hasta aca (2 de "sale" + 1 de "staleSale"); dejamos
  // lugar para reservar el carrito (capacidad 4) y despues lo ajustamos a 3
  // para simular que ya no queda cupo para cuando el pago tardio se acredita.
  await db.exec(`update ticket_types set capacity = 4 where id='${ticketType}'`);
  const lateStaleSale = await scalar(`select sale_id::text from create_online_sale('${event}', ${cart(1)}, ${buyer("666666")})`);
  await db.exec(`update sales set created_at = now() - interval '40 minutes' where id='${lateStaleSale}'`);
  assert.equal(await scalar("select cp_cancel_stale_online_sales()"), 1);
  assert.equal(await scalar(`select status from sales where id='${lateStaleSale}'`), "cancelled");
  await db.exec(`update ticket_types set capacity = 3 where id='${ticketType}'`);
  await db.query("select confirm_online_sale($1,'approved')", [lateStaleSale]);
  assert.equal(await scalar(`select status from sales where id='${lateStaleSale}'`), "cancelled", "no debe revivir ni sobrevender si ya no hay cupo");
  assert.equal(await scalar(`select count(*)::int from tickets where sale_id='${lateStaleSale}'`), 0);

  // Pack online: 1 "pack" en el carrito genera todas las entradas del pack
  // (quantity_per_pack), cobra el precio del pack (no N x precio de lista),
  // y devuelve line_total_minor exacto para que el checkout arme el cobro
  // de Mercado Pago sin ningun riesgo de redondeo.
  const packTicketType = "88888888-8888-4888-8888-888888888888";
  const pack = "99999999-9999-4999-8999-999999999999";
  await db.exec(`insert into ticket_types(id,event_id,name,price_minor,capacity,active,status)
      values ('${packTicketType}','${event}','Pack General',5000,20,true,'available');
    insert into ticket_packs(id,event_id,ticket_type_id,name,quantity_per_pack,price_minor)
      values ('${pack}','${event}','${packTicketType}','Pack x3',3,13000);`);

  const packCart = `'[{"ticket_type_id":"${packTicketType}","pack_id":"${pack}","quantity":2}]'::jsonb`;
  const packSale = await db.query<{ sale_id: string; total_minor: string; items: unknown }>(
    `select sale_id, total_minor, items from create_online_sale('${event}', ${packCart}, ${buyer("777777")})`
  );
  const packItems = packSale.rows[0].items as { name: string; quantity: number; unit_price_minor: number; line_total_minor: number; pack_id: string }[];
  assert.equal(Number(packSale.rows[0].total_minor), 26000, "2 packs de $13000 = $26000, no 6 x 5000");
  assert.equal(packItems[0].quantity, 6, "2 packs x 3 entradas = 6");
  assert.equal(packItems[0].name, "Pack x3", "el nombre que ve el comprador es el del pack, no el de la tanda");
  assert.equal(packItems[0].line_total_minor, 26000);
  assert.equal(packItems[0].pack_id, pack);

  await db.query("select confirm_online_sale($1,'approved')", [packSale.rows[0].sale_id]);
  assert.equal(await scalar(`select count(*)::int from tickets where sale_id='${packSale.rows[0].sale_id}'`), 6, "confirmar la venta emite las 6 entradas del pack");
  assert.equal(await scalar(`select pack_id::text from sale_items where sale_id='${packSale.rows[0].sale_id}'`), pack);

  // Un pack inactivo o de otro evento no se puede comprar online.
  await db.exec(`update ticket_packs set active = false where id = '${pack}'`);
  await assert.rejects(
    () => db.query(`select * from create_online_sale('${event}', ${packCart}, ${buyer("888888")})`),
    /pack no existe o no esta disponible/
  );

  // Un pago RECHAZADO que llega DESPUES de que otro intento (misma venta,
  // otro payment_id de Mercado Pago) ya la confirmo NO debe anular las
  // entradas ya emitidas/enviadas -- es un intento de pago distinto que
  // perdio la carrera, no un reembolso del pago que si se acredito. Antes
  // cualquier estado que no fuera "todavia pendiente" disparaba el mismo
  // camino que un reembolso real.
  const lateRejectTicketType = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  await db.exec(`insert into ticket_types(id,event_id,name,price_minor,capacity,active,status)
    values ('${lateRejectTicketType}','${event}','Pago tardio test',5000,5,true,'available');`);
  const lateRejectCart = `'[{"ticket_type_id":"${lateRejectTicketType}","quantity":1}]'::jsonb`;
  const lateRejectSale = await scalar(`select sale_id::text from create_online_sale('${event}', ${lateRejectCart}, ${buyer("999912")})`);
  await db.query("select confirm_online_sale($1,'approved')", [lateRejectSale]);
  assert.equal(await scalar(`select status from sales where id='${lateRejectSale}'`), "confirmed");
  const lateRejectTicketId = await scalar(`select id::text from tickets where sale_id='${lateRejectSale}'`);

  for (const laterStatus of ["rejected", "cancelled", "pending", "in_process"]) {
    await db.query("select confirm_online_sale($1,$2)", [lateRejectSale, laterStatus]);
    assert.equal(await scalar(`select status from sales where id='${lateRejectSale}'`), "confirmed", `un aviso '${laterStatus}' tardio sobre una venta ya confirmada no debe tocarla`);
    assert.equal(await scalar(`select status from tickets where id='${lateRejectTicketId}'`), "issued", `la entrada ya emitida sigue valida tras un aviso '${laterStatus}' tardio`);
  }

  // Un reembolso/contracargo sobre una venta YA confirmada anula las
  // entradas emitidas (no deben poder usarse en la puerta) y libera el
  // cupo -- antes quedaba "confirmed" para siempre sin importar reembolsos
  // posteriores del comprador. Tanda aparte para no alterar los conteos
  // acumulados que ya verificaron los pasos anteriores.
  const refundTicketType = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await db.exec(`insert into ticket_types(id,event_id,name,price_minor,capacity,active,status)
    values ('${refundTicketType}','${event}','Reembolso test',5000,2,true,'available');`);
  const refundCart = `'[{"ticket_type_id":"${refundTicketType}","quantity":2}]'::jsonb`;
  const refundSale = await scalar(`select sale_id::text from create_online_sale('${event}', ${refundCart}, ${buyer("999999")})`);
  await db.query("select confirm_online_sale($1,'approved')", [refundSale]);
  assert.equal(await scalar(`select status from ticket_types where id='${refundTicketType}'`), "sold_out", "se agoto con las 2 entradas confirmadas");

  await db.query("select confirm_online_sale($1,'refunded')", [refundSale]);
  assert.equal(await scalar(`select status from sales where id='${refundSale}'`), "refunded");
  assert.equal(await scalar(`select count(*)::int from tickets where sale_id='${refundSale}' and status='cancelled'`), 2, "las entradas ya emitidas se anulan");
  assert.equal(await scalar(`select status from ticket_types where id='${refundTicketType}'`), "available", "el cupo liberado reactiva la tanda agotada");

  // Idempotente: un reintento del mismo aviso de reembolso no debe romper nada.
  await db.query("select confirm_online_sale($1,'refunded')", [refundSale]);
  assert.equal(await scalar(`select status from sales where id='${refundSale}'`), "refunded");

  await db.close();
});

test("tandas: no se puede bajar el cupo por debajo de lo ya vendido (bloqueado en la base, no solo en la pantalla)", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "d2d1d0d0-1111-4111-8111-111111111111";
  const event = "d2d1d0d0-2222-4222-8222-222222222222";
  const ticketType = "d2d1d0d0-3333-4333-8333-333333333333";

  await db.exec(`insert into organizations(id,name,slug) values ('${org}','Club Cupo','club-cupo');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into ticket_types(id,event_id,name,price_minor,capacity,active,status) values ('${ticketType}','${event}','General',5000,10,true,'available');`);

  const buyerId = await scalar(`insert into buyers(organization_id,first_name,last_name,dni) values ('${org}','C','omprador','1') returning id::text`);
  const saleId = await scalar(`insert into sales(organization_id,event_id,buyer_id,status,total_minor,channel) values ('${org}','${event}','${buyerId}','confirmed',15000,'online') returning id::text`);
  const itemId = await scalar(`insert into sale_items(sale_id,event_id,ticket_type_id,quantity,unit_price_minor) values ('${saleId}','${event}','${ticketType}',3,5000) returning id::text`);
  await db.exec(`insert into tickets(sale_item_id,sale_id,event_id,ticket_type_id,manual_code,status) values
    ('${itemId}','${saleId}','${event}','${ticketType}','CUPO01','issued'),
    ('${itemId}','${saleId}','${event}','${ticketType}','CUPO02','issued'),
    ('${itemId}','${saleId}','${event}','${ticketType}','CUPO03','cancelled')`);
  // 3 entradas cargadas, pero 1 esta cancelada -> solo cuentan 2 como "vendidas".

  await assert.rejects(
    () => db.query(`update ticket_types set capacity = 1 where id='${ticketType}'`),
    /No podés reducir el cupo.*2 entradas vendidas/,
    "no puede bajar a menos de las 2 entradas realmente vendidas (la cancelada no cuenta)"
  );
  assert.equal(await scalar(`select capacity from ticket_types where id='${ticketType}'`), 10, "el rechazo no toco el cupo");

  // Bajarlo justo a lo vendido (2) si se permite.
  await db.query(`update ticket_types set capacity = 2 where id='${ticketType}'`);
  assert.equal(await scalar(`select capacity from ticket_types where id='${ticketType}'`), 2);

  // Subirlo siempre esta permitido.
  await db.query(`update ticket_types set capacity = 100 where id='${ticketType}'`);
  assert.equal(await scalar(`select capacity from ticket_types where id='${ticketType}'`), 100);

  // Editar otro campo sin tocar capacity no dispara el chequeo.
  await db.query(`update ticket_types set name = 'General (renombrada)' where id='${ticketType}'`);
  assert.equal(await scalar(`select name from ticket_types where id='${ticketType}'`), "General (renombrada)");

  // Nota: borrar una tanda con ventas ya esta bloqueado por la FK de
  // sale_items en la base real (confirmado en vivo con Eze via pg_constraint
  // -- confdeltype "sin accion"). El fixture de este harness no declara esa
  // FK (igual que otros tests de este archivo que la agregan a mano cuando
  // la necesitan), asi que no se reproduce aca para no duplicar cobertura
  // de algo ya verificado contra la base real.

  // capacity NULL/0/negativo: sin este constraint, "x > NULL" en PL/pgSQL
  // es NULL (no dispara el "if"), asi que una tanda con capacity NULL
  // colaba cupo infinito en confirm_online_sale/create_sale sin que nadie
  // lo notara -- mismo patron ya arreglado para price_minor.
  await assert.rejects(
    () => db.exec(`insert into ticket_types(event_id,name,price_minor,capacity) values ('${event}','Sin cupo',5000,null)`),
    /ticket_types_capacity_positive|violates check constraint|null value/,
    "capacity NULL debe rechazarse a nivel de base"
  );
  await assert.rejects(
    () => db.exec(`insert into ticket_types(event_id,name,price_minor,capacity) values ('${event}','Cupo cero',5000,0)`),
    /ticket_types_capacity_positive|violates check constraint/,
    "capacity 0 debe rechazarse a nivel de base"
  );
  await db.exec(`insert into ticket_types(event_id,name,price_minor,capacity) values ('${event}','Con cupo',5000,5)`);

  await db.close();
});

test("ventas online: create_online_sale y create_online_table_sale son idempotentes por clave", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const admin = "d0d0d0d0-dddd-4ddd-8ddd-dddddddddddd";
  const org = "d0d0d0d0-eeee-4eee-8eee-eeeeeeeeeeee";
  const event = "d0d0d0d0-ffff-4fff-8fff-ffffffffffff";
  const ticketType = "d0d0d0d0-1111-4111-8111-111111111111";
  const table = "d0d0d0d0-2222-4222-8222-222222222222";
  const key = "d0d0d0d0-3333-4333-8333-333333333333";
  const buyer = (n: string) => `'Comprador','${n}','30${n}','3462${n}',null`;

  await db.exec(`insert into auth.users values ('${admin}','admin-idem@example.test',now(),'{}');
    insert into platform_admins(user_id) values ('${admin}');
    insert into organizations(id,name,slug) values ('${org}','Club Idempotencia','club-idempotencia');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into ticket_types(id,event_id,name,price_minor,capacity,active,status)
      values ('${ticketType}','${event}','General',5000,10,true,'available');
    insert into bar_tables(id,event_id,name,capacity,price_minor,status) values ('${table}','${event}','Mesa 1',6,10000,'available');
    insert into organization_mercadopago_accounts(organization_id,mp_user_id,access_token,refresh_token,expires_at)
      values ('${org}', 1, 'tok', 'ref', now() + interval '1 day');
    select set_config('request.jwt.claim.sub','${admin}',false);`);

  const cart = `'[{"ticket_type_id":"${ticketType}","quantity":2}]'::jsonb`;

  const first = await db.query<{ sale_id: string; already_existed: boolean }>(
    `select sale_id, already_existed from create_online_sale('${event}', ${cart}, ${buyer("111111")}, '${key}')`
  );
  assert.equal(first.rows[0].already_existed, false, "la primera vez es una venta nueva");

  const retry = await db.query<{ sale_id: string; already_existed: boolean; total_minor: string }>(
    `select sale_id, already_existed, total_minor from create_online_sale('${event}', ${cart}, ${buyer("111111")}, '${key}')`
  );
  assert.equal(retry.rows[0].sale_id, first.rows[0].sale_id, "un reintento con la misma clave devuelve la MISMA venta");
  assert.equal(retry.rows[0].already_existed, true);
  assert.equal(Number(retry.rows[0].total_minor), 10000);
  assert.equal(Number(await scalar(`select count(*)::int from sales where event_id='${event}'`)), 1, "no se duplico la venta");
  assert.equal(Number(await scalar(`select count(*)::int from sale_items where sale_id='${first.rows[0].sale_id}'`)), 1, "tampoco los items");

  // Sin clave (null), sigue funcionando como siempre: cada llamada crea una venta nueva.
  const noKey1 = await scalar(`select sale_id::text from create_online_sale('${event}', ${cart}, ${buyer("222222")})`);
  const noKey2 = await scalar(`select sale_id::text from create_online_sale('${event}', ${cart}, ${buyer("333333")})`);
  assert.notEqual(noKey1, noKey2, "sin clave, cada llamada sigue creando una venta distinta (no rompe el comportamiento existente)");

  // Mismo mecanismo para la reserva de mesa online.
  const tableKey = "d0d0d0d0-4444-4444-8444-444444444444";
  const firstTable = await db.query<{ sale_id: string; already_existed: boolean }>(
    `select sale_id, already_existed from create_online_table_sale('${event}','${table}', ${buyer("444444")}, '${tableKey}')`
  );
  assert.equal(firstTable.rows[0].already_existed, false);
  const retryTable = await db.query<{ sale_id: string; already_existed: boolean }>(
    `select sale_id, already_existed from create_online_table_sale('${event}','${table}', ${buyer("444444")}, '${tableKey}')`
  );
  assert.equal(retryTable.rows[0].sale_id, firstTable.rows[0].sale_id, "misma clave -> misma reserva, no reclama la mesa dos veces");
  assert.equal(retryTable.rows[0].already_existed, true);
  assert.equal(await scalar(`select status from bar_tables where id='${table}'`), "reserved", "la mesa sigue reservada una sola vez");

  await db.close();
});

test("devoluciones: anular una entrada a mano reabre la tanda agotada si vuelve a haber lugar", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "d1d0d0d0-1111-4111-8111-111111111111";
  const event = "d1d0d0d0-2222-4222-8222-222222222222";
  const organizerUser = "d1d0d0d0-3333-4333-8333-333333333333";
  const ticketType = "d1d0d0d0-4444-4444-8444-444444444444";

  await db.exec(`insert into auth.users values ('${organizerUser}','org-devol@example.test',now(),'{}');
    insert into organizations(id,name,slug) values ('${org}','Club Devol','club-devol');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${organizerUser}','organizer','active');
    insert into ticket_types(id,event_id,name,price_minor,capacity,active,status) values ('${ticketType}','${event}','VIP',5000,1,true,'sold_out');`);

  const buyerId = await scalar(`insert into buyers(organization_id,first_name,last_name,dni) values ('${org}','C','omprador','1') returning id::text`);
  const saleId = await scalar(`insert into sales(organization_id,event_id,buyer_id,status,total_minor,channel) values ('${org}','${event}','${buyerId}','confirmed',5000,'online') returning id::text`);
  const itemId = await scalar(`insert into sale_items(sale_id,event_id,ticket_type_id,quantity,unit_price_minor) values ('${saleId}','${event}','${ticketType}',1,5000) returning id::text`);
  const ticketId = await scalar(`insert into tickets(sale_item_id,sale_id,event_id,ticket_type_id,manual_code,status) values ('${itemId}','${saleId}','${event}','${ticketType}','VIPX01','issued') returning id::text`);

  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false)`);
  assert.equal(await scalar(`select status from ticket_types where id='${ticketType}'`), "sold_out");

  await db.query(`select * from process_ticket_return('${ticketId}','Se devuelve a mano','no_refund',null)`);
  assert.equal(await scalar(`select status from ticket_types where id='${ticketType}'`), "available", "vuelve a haber lugar real -> la tanda se reabre para la venta online");
  assert.equal(await scalar(`select status from tickets where id='${ticketId}'`), "cancelled");

  await db.close();
});

test("stock de barra: barras, bartenders, mesas y venta de tragos", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "22222222-2222-4222-8222-222222222222";
  const event = "33333333-3333-4333-8333-333333333333";
  const organizerUser = "44444444-4444-4444-8444-444444444444";
  const bartenderUser = "55555555-5555-4555-8555-555555555555";
  const bar = "66666666-6666-4666-8666-666666666666";
  const table = "77777777-7777-4777-8777-777777777777";
  const eventProduct = "88888888-8888-4888-8888-888888888888";
  const plan = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const signup = "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

  await db.exec(`insert into auth.users values ('${organizerUser}','org@example.test',now(),'{}');
    insert into auth.users values ('${bartenderUser}','bartender@example.test',now(),'{}');
    insert into organizations(id,name,slug) values ('${org}','Club Stock','club-stock');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into subscription_plans(id,code,name,price_minor) values ('${plan}','monthly-stock','Mensual',10000);
    insert into subscription_signups(id,plan_id,organization_id,first_name,last_name,organization_name,email,expected_amount,expected_currency,frequency_months)
      values ('${signup}','${plan}','${org}','Org','Test','Club Stock','org@example.test',10000,'ARS',1);`);

  // Le damos a la organizacion una suscripcion activa real (mismo RPC que
  // usa el webhook de verdad), asi cp_org_has_service da true sin importar
  // que usuario (organizador o bartender) este llamando despues.
  await db.query(
    "select cp_record_payment($1,'stock-test-payment','approved',10000,'ARS',now(),now())",
    [signup]
  );
  assert.equal(await scalar(`select cp_org_has_service('${org}')`), true);

  const organizerMember = await scalar(
    `insert into organization_members(organization_id,user_id,role,status) values ('${org}','${organizerUser}','organizer','active') returning id::text`
  );
  const bartenderMember = await scalar(
    `insert into organization_members(organization_id,user_id,role,status) values ('${org}','${bartenderUser}','bartender','active') returning id::text`
  );

  const productId = await scalar(`select id::text from products where name like 'Fernet Branca%' limit 1`);
  assert.ok(productId, "el catalogo global debe traer Fernet Branca precargado");

  await db.exec(`insert into event_products(id,event_id,product_id,cost_price_minor,sale_price_minor,profit_margin_percent,total_stock,low_stock_threshold)
    values ('${eventProduct}','${event}','${productId}',10000,2000,50,10,3);
    insert into bars(id,event_id,name) values ('${bar}','${event}','Barra 1');
    insert into bar_tables(id,event_id,name,capacity,price_minor) values ('${table}','${event}','Mesa 1',6,5000);`);

  // Asignar stock a la barra requiere estar logueado como organizador de esa org.
  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false);`);
  await db.query(`select assign_stock_to_bar('${eventProduct}','${bar}',8)`);
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProduct}'`), 8);
  assert.equal(await scalar(`select count(*)::int from stock_movements where type='asignacion_barra'`), 1);

  // No se puede asignar mas de lo que hay en el pool general (10 total, ya se asignaron 8).
  await assert.rejects(
    () => db.query(`select assign_stock_to_bar('${eventProduct}','${bar}',5)`),
    /No hay suficiente stock general/, "no debe permitir asignar mas stock del que existe"
  );

  // cp_upsert_event_product: no deja bajar total_stock por debajo de lo ya
  // repartido en barras (8), en la misma operacion que guarda el resto de
  // los campos -- antes eran dos consultas separadas sin ningun lock.
  await assert.rejects(
    () => db.query(`select cp_upsert_event_product('${event}','${productId}',10000,2000,50,5,3)`),
    /No podés bajar el stock total.*8/,
    "no puede bajar total_stock a menos de lo repartido (8) en barras"
  );
  assert.equal(await scalar(`select total_stock from event_products where id='${eventProduct}'`), 10, "el rechazo no toco nada");

  // Bajarlo justo al limite (8, igual a lo repartido) si se permite, y
  // actualiza el resto de los campos (mismo costo/precio que ya tenia, para
  // no alterar los totales que el resto de este test calcula mas abajo).
  await db.query(`select cp_upsert_event_product('${event}','${productId}',10000,2000,50,8,4)`);
  const afterLower = await db.query<{ total_stock: number; cost_price_minor: string; low_stock_threshold: number }>(
    `select total_stock, cost_price_minor, low_stock_threshold from event_products where id='${eventProduct}'`
  );
  assert.equal(afterLower.rows[0].total_stock, 8);
  assert.equal(Number(afterLower.rows[0].cost_price_minor), 10000);
  assert.equal(afterLower.rows[0].low_stock_threshold, 4);

  // Lo vuelve a subir a 10 (como estaba al principio): el resto de este
  // test asume ese total_stock para sus propios chequeos de cupo.
  await db.query(`select cp_upsert_event_product('${event}','${productId}',10000,2000,50,10,3)`);

  // Vender una mesa: la puede vender el organizador.
  const tableSale = await scalar(
    `select sale_id::text from sell_table('${event}','${table}','Cliente','Mesa','30111222','3462111222','efectivo')`
  );
  assert.equal(await scalar(`select channel from sales where id='${tableSale}'`), "mesa");
  assert.equal(await scalar(`select status from bar_tables where id='${table}'`), "reserved");
  assert.equal(await scalar(`select count(*)::int from tickets where sale_id='${tableSale}'`), 1, "la mesa vendida en persona genera su propia entrada/QR, igual que ya hace confirm_online_sale para las mesas compradas online");
  assert.equal(await scalar(`select status from tickets where sale_id='${tableSale}'`), "issued");

  // No se puede vender la misma mesa dos veces.
  await assert.rejects(
    () => db.query(`select sell_table('${event}','${table}','Otro','Cliente','30333444','3462333444','efectivo')`),
    /ya no esta disponible/
  );

  // Idempotencia: un reintento con la MISMA clave (ej. el RRPP reintenta
  // tras perder la respuesta por un corte de wifi) no debe reservar una
  // mesa nueva ni crear una segunda venta.
  const table2 = "88888888-8888-4888-8888-888888888888";
  await db.exec(`insert into bar_tables(id,event_id,name,capacity,price_minor) values ('${table2}','${event}','Mesa 2',4,7000);`);
  const tableSaleKey = "c0ffee00-0000-4000-8000-000000000042";
  const tableSaleFirst = await scalar(
    `select sale_id::text from sell_table('${event}','${table2}','Cliente','Idempotente','30777888','3462777888','efectivo','${tableSaleKey}')`
  );
  const tableSaleRetry = await scalar(
    `select sale_id::text from sell_table('${event}','${table2}','Cliente','Idempotente','30777888','3462777888','efectivo','${tableSaleKey}')`
  );
  assert.equal(tableSaleRetry, tableSaleFirst, "el reintento devuelve la MISMA venta, no crea una nueva");
  assert.equal(await scalar(`select count(*)::int from sales where table_id='${table2}'`), 1, "no se duplico la venta de la mesa");
  assert.equal(await scalar(`select count(*)::int from tickets where sale_id='${tableSaleFirst}'`), 1, "el reintento tampoco duplico la entrada/QR de la mesa");
  assert.equal(await scalar(`select status from bar_tables where id='${table2}'`), "reserved");

  // Asignar la cuenta bartender a la barra (event_staff) para que pueda vender ahi.
  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false);
    insert into event_staff(event_id,organization_member_id,staff_role,active,bar_id)
      values ('${event}','${bartenderMember}','bartender',true,'${bar}');`);

  // El bartender vende un trago: ya NO descuenta bar_stock en tiempo real
  // (no hay forma de saber cuanto le queda realmente a una botella hasta
  // el conteo fisico del cierre de noche) -- solo se registra la venta.
  await db.exec(`select set_config('request.jwt.claim.sub','${bartenderUser}',false);`);
  const barSaleKey = "c0ffee00-0000-4000-8000-000000000001";
  const barSale = await db.query<{ bar_sale_id: string; total_minor: string }>(
    `select bar_sale_id, total_minor from create_bartender_sale('${bar}','${table}','${eventProduct}',3,'transferencia','${barSaleKey}')`
  );
  assert.equal(Number(barSale.rows[0].total_minor), 6000, "3 tragos a 2000 cada uno");
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProduct}'`), 8, "vender tragos no descuenta el stock del sistema");
  assert.equal(await scalar(`select count(*)::int from stock_movements where type='venta'`), 1);

  // Reintento con la MISMA idempotency key (ej: se corto el wifi justo
  // despues de cobrar y el bartender aprieta "Confirmar venta" de nuevo):
  // debe devolver la venta original, sin crear una fila nueva en
  // bar_sales ni en stock_movements.
  const retriedSale = await db.query<{ bar_sale_id: string; total_minor: string }>(
    `select bar_sale_id, total_minor from create_bartender_sale('${bar}','${table}','${eventProduct}',3,'transferencia','${barSaleKey}')`
  );
  assert.equal(retriedSale.rows[0].bar_sale_id, barSale.rows[0].bar_sale_id, "el reintento devuelve la MISMA venta, no crea una nueva");
  assert.equal(Number(retriedSale.rows[0].total_minor), 6000);
  assert.equal(await scalar(`select count(*)::int from bar_sales where idempotency_key='${barSaleKey}'`), 1, "no se duplico la fila de venta");
  assert.equal(await scalar(`select count(*)::int from stock_movements where type='venta'`), 1, "el reintento no genero un segundo movimiento de stock");

  // Vender mas tragos de los que "figuran" ya no se bloquea (el numero de
  // stock no baja con cada trago, asi que no hay contra que comparar).
  const bigSale = await db.query<{ bar_sale_id: string; total_minor: string }>(
    `select bar_sale_id, total_minor from create_bartender_sale('${bar}','${table}','${eventProduct}',10,'efectivo')`
  );
  assert.equal(Number(bigSale.rows[0].total_minor), 20000, "10 tragos a 2000 cada uno, sin bloqueo por stock");
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProduct}'`), 8, "sigue sin descontarse");

  // Pero solo puede vender productos que el organizador realmente asigno a
  // esa barra (aunque sea con cantidad 0) -- si no hay fila de bar_stock,
  // se rechaza.
  const otherProductId = await scalar(`select id::text from products where name like 'Vodka Absolut%' limit 1`);
  const unassignedEventProduct = "88888888-8888-4888-8888-888888888801";
  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false);
    insert into event_products(id,event_id,product_id,cost_price_minor,sale_price_minor,profit_margin_percent,total_stock,low_stock_threshold)
      values ('${unassignedEventProduct}','${event}','${otherProductId}',10000,2000,50,10,3);
    select set_config('request.jwt.claim.sub','${bartenderUser}',false);`);
  await assert.rejects(
    () => db.query(`select create_bartender_sale('${bar}','${table}','${unassignedEventProduct}',1,'efectivo')`),
    /no esta asignado a esta barra/
  );

  // Un bartender no puede vender desde una barra a la que no esta asignado.
  const otherBar = "99999999-9999-4999-8999-999999999999";
  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false);
    insert into bars(id,event_id,name) values ('${otherBar}','${event}','Barra 2');
    select assign_stock_to_bar('${eventProduct}','${otherBar}',2);
    select set_config('request.jwt.claim.sub','${bartenderUser}',false);`);
  await assert.rejects(
    () => db.query(`select create_bartender_sale('${otherBar}','${table}','${eventProduct}',1,'efectivo')`),
    /No estas asignado a esta barra/
  );

  // Ajuste manual por perdida (ej: se rompio una botella) -- este si mueve
  // bar_stock, es la unica forma de corregirlo ahora que los tragos no lo
  // hacen solos.
  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false);`);
  await db.query(`select adjust_bar_stock('${bar}','${eventProduct}',-1,'perdida','Se rompio una botella')`);
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProduct}'`), 7, "8 - 1 de perdida");

  // No puede dejar el stock en negativo.
  await assert.rejects(
    () => db.query(`select adjust_bar_stock('${bar}','${eventProduct}',-100,'perdida','Motivo')`),
    /negativo/
  );

  // assign_stock_to_bar debe medir "ya repartido" con la suma EN VIVO de
  // bar_stock (7 en esta barra + 2 en otherBar = 9), no con el historico de
  // stock_movements tipo asignacion_barra (8 + 2 = 10, que no bajo con la
  // perdida de arriba) -- con el historico, total_stock=10 ya estaria "al
  // limite" (10+cualquier cosa > 10) y esto rechazaria sin motivo real.
  await db.query(`select assign_stock_to_bar('${eventProduct}','${otherBar}',1)`);
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${otherBar}' and event_product_id='${eventProduct}'`), 3, "la perdida en OTRA barra libero margen para asignar aca");
  // Se revierte para no alterar el margen que asume la prueba siguiente.
  await db.query(`select adjust_bar_stock('${otherBar}','${eventProduct}',-1,'ajuste','Revertir prueba de assign_stock_to_bar')`);
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${otherBar}' and event_product_id='${eventProduct}'`), 2);

  // Un ajuste positivo tampoco puede "inventar" mas stock del total
  // comprado: bar=7 + otherBar=2 = 9 repartido, total_stock=10, asi que
  // solo hay lugar para 1 mas entre todas las barras.
  await assert.rejects(
    () => db.query(`select adjust_bar_stock('${bar}','${eventProduct}',5,'ajuste','Conteo')`),
    /superaria el stock total/
  );
  await db.query(`select adjust_bar_stock('${bar}','${eventProduct}',1,'ajuste','Conteo correcto')`);
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProduct}'`), 8);
  // Se revierte para no alterar los conteos que verifican los pasos siguientes.
  await db.query(`select adjust_bar_stock('${bar}','${eventProduct}',-1,'ajuste','Revertir prueba de tope')`);
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProduct}'`), 7);

  // El producto de un ajuste tiene que pertenecer al MISMO evento que la
  // barra -- antes no se validaba, permitiendo ajustar/inflar stock de un
  // producto de otro evento u organizacion via adjust_bar_stock.
  const otherEvent = "33333333-3333-4333-8333-333333333399";
  const otherEventProduct = "88888888-8888-4888-8888-888888888802";
  await db.exec(`insert into events(id,organization_id,status) values ('${otherEvent}','${org}','active');
    insert into event_products(id,event_id,product_id,cost_price_minor,sale_price_minor,profit_margin_percent,total_stock,low_stock_threshold)
      values ('${otherEventProduct}','${otherEvent}','${productId}',10000,2000,50,10,3);`);
  await assert.rejects(
    () => db.query(`select adjust_bar_stock('${bar}','${otherEventProduct}',1,'ajuste','Producto de otro evento')`),
    /no pertenece a este evento/
  );

  // El bartender tambien puede vender sin atarse a una mesa (cliente en el mostrador).
  await db.exec(`select set_config('request.jwt.claim.sub','${bartenderUser}',false);`);
  const barSaleNoTable = await db.query<{ bar_sale_id: string; total_minor: string }>(
    `select bar_sale_id, total_minor from create_bartender_sale('${bar}',null,'${eventProduct}',1,'efectivo')`
  );
  assert.equal(Number(barSaleNoTable.rows[0].total_minor), 2000, "1 trago a 2000");
  assert.equal(
    await scalar(`select table_id from bar_sales where id='${barSaleNoTable.rows[0].bar_sale_id}'`),
    null,
    "la venta sin mesa debe guardar table_id null"
  );
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProduct}'`), 7, "vender un trago no toca el stock");

  // create_bartender_sale valida cp_org_has_stock_access (mismo gate que ya
  // usan assign_stock_to_bar/adjust_bar_stock/redeem_combo_ticket), no solo
  // cp_org_has_service -- antes, bloquear el modulo de stock de una
  // organizacion (organizations.stock_access_blocked) dejaba el panel de
  // administracion sin acceso pero el bartender seguia pudiendo vender
  // tragos sin limite.
  await db.exec(`update organizations set stock_access_blocked = true where id = '${org}'`);
  await assert.rejects(
    () => db.query(`select create_bartender_sale('${bar}','${table}','${eventProduct}',1,'efectivo')`),
    /no tiene acceso al modulo de stock/,
    "bloquear el modulo de stock tiene que frenar tambien la venta en /bartender, no solo el panel del organizador"
  );
  await db.exec(`update organizations set stock_access_blocked = false where id = '${org}'`);
  const barSaleAfterUnblock = await db.query<{ bar_sale_id: string; total_minor: string }>(
    `select bar_sale_id, total_minor from create_bartender_sale('${bar}','${table}','${eventProduct}',1,'efectivo')`
  );
  assert.equal(Number(barSaleAfterUnblock.rows[0].total_minor), 2000, "vuelve a funcionar al desbloquear");

  // Un bartender no puede cancelar ventas (solo el organizador).
  await assert.rejects(
    () => db.query(`select cancel_bar_sale('${barSaleNoTable.rows[0].bar_sale_id}','Me equivoque de trago')`),
    /No tenes permiso/
  );

  // El organizador cancela la venta de barra: como un trago suelto nunca
  // descuenta bar_stock, cancelarlo tampoco le devuelve nada (no hay nada
  // que devolver) -- solo queda registrada la cancelacion.
  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false);`);
  await db.query(`select cancel_bar_sale('${barSaleNoTable.rows[0].bar_sale_id}','Me equivoque de trago')`);
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProduct}'`), 7, "cancelar un trago no mueve stock, nunca se habia descontado");
  assert.ok(await scalar(`select cancelled_at from bar_sales where id='${barSaleNoTable.rows[0].bar_sale_id}'`), "debe quedar marcada como cancelada");

  // No se puede cancelar dos veces la misma venta.
  await assert.rejects(
    () => db.query(`select cancel_bar_sale('${barSaleNoTable.rows[0].bar_sale_id}','De nuevo')`),
    /ya estaba cancelada/
  );

  // Un bartender tampoco puede cancelar ventas de mesa (solo el organizador).
  await db.exec(`select set_config('request.jwt.claim.sub','${bartenderUser}',false);`);
  await assert.rejects(
    () => db.query(`select cancel_table_sale('${tableSale}','Me equivoque')`),
    /No tenes permiso/
  );

  // Cancelar una venta de mesa libera la mesa para volver a venderla.
  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false);`);
  await db.query(`select cancel_table_sale('${tableSale}','Cliente no llego')`);
  assert.equal(await scalar(`select status from sales where id='${tableSale}'`), "cancelled");
  assert.equal(await scalar(`select status from bar_tables where id='${table}'`), "available");
  assert.equal(
    await scalar(`select count(*)::int from tickets where sale_id='${tableSale}' and status='issued'`),
    0,
    "cancelar la mesa tiene que anular su QR: si no, el comprador cancelado entra igual"
  );

  // Con la mesa liberada, se puede volver a vender.
  const resoldTable = await scalar(
    `select sale_id::text from sell_table('${event}','${table}','Otro','Cliente','30555666','3462555666','efectivo')`
  );
  assert.ok(resoldTable, "la mesa liberada se puede volver a vender");

  void organizerMember;
  await db.close();
});

test("verificacion final barra/colectivos: adjust_bar_stock es idempotente, redeem_combo_ticket se frena con rate limit, y un pasaje cancelado no bloquea reasignar", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  const org = "e1111111-1111-4111-8111-111111111111";
  const event = "e2222222-2222-4222-8222-222222222222";
  const organizerUser = "e3333333-3333-4333-8333-333333333333";
  const bartenderUser = "e4444444-4444-4444-8444-444444444444";
  const bar = "e5555555-5555-4555-8555-555555555555";
  const eventProduct = "e6666666-6666-4666-8666-666666666666";
  const route = "e7777777-7777-4777-8777-777777777777";
  const sale = "e8888888-8888-4888-8888-888888888888";

  await db.exec(`insert into auth.users values ('${organizerUser}','org-verif@example.test',now(),'{}'), ('${bartenderUser}','bartender-verif@example.test',now(),'{}');
    insert into organizations(id,name,slug,complimentary) values ('${org}','Club Verif','club-verif',true);
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${organizerUser}','organizer','active'), ('${org}','${bartenderUser}','bartender','active');`);

  const organizerMember = await scalar(`select id::text from organization_members where user_id='${organizerUser}'`);
  const bartenderMember = await scalar(`select id::text from organization_members where user_id='${bartenderUser}'`);
  const productId = await scalar(`select id::text from products where name like 'Fernet Branca%' limit 1`);

  await db.exec(`insert into event_products(id,event_id,product_id,cost_price_minor,sale_price_minor,profit_margin_percent,total_stock,low_stock_threshold)
      values ('${eventProduct}','${event}','${productId}',10000,2000,50,50,3);
    insert into bars(id,event_id,name) values ('${bar}','${event}','Barra Verif');
    insert into event_staff(event_id,organization_member_id,staff_role,active,bar_id) values ('${event}','${bartenderMember}','bartender',true,'${bar}');`);

  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false);`);
  await db.query(`select assign_stock_to_bar('${eventProduct}','${bar}',20)`);

  // adjust_bar_stock es idempotente: un reintento con la MISMA clave (ej.
  // el segundo producto de un cierre de noche fallo por wifi y el
  // organizador reintenta desde cero) no aplica el ajuste dos veces.
  const closeKey = "close-attempt-1:" + eventProduct;
  await db.query(`select adjust_bar_stock('${bar}','${eventProduct}',-3,'ajuste','Conteo cierre','${closeKey}')`);
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProduct}'`), 17);
  await db.query(`select adjust_bar_stock('${bar}','${eventProduct}',-3,'ajuste','Conteo cierre','${closeKey}')`);
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProduct}'`), 17, "el reintento con la misma clave no descuenta una segunda vez");
  assert.equal(await scalar(`select count(*)::int from stock_movements where idempotency_key='${closeKey}'`), 1);

  // redeem_combo_ticket: rate limit (se precarga el balde ya en el limite).
  await db.exec(`select set_config('request.jwt.claim.sub','${bartenderUser}',false);`);
  await db.exec(
    `insert into rate_limit_buckets(key, window_start, count) values ('combo-redeem:${bartenderUser}', now(), 60)`
  );
  await assert.rejects(
    () => db.query(`select redeem_combo_ticket('${bar}','NOEXISTE','${eventProduct}',1)`),
    /Demasiados intentos/,
    "el canje de combo tambien se frena con rate limit"
  );

  // Colectivos: cancelar un pasaje y volver a llamar assign_transfer_ticket
  // con el MISMO sale_id+route_id tiene que generar un codigo NUEVO, no
  // devolver el viejo ya cancelado (que quedaria invalido para siempre).
  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false);
    insert into transfer_routes(id,event_id,organization_member_id,name) values ('${route}','${event}','${organizerMember}','Ruta Verif');
    insert into sales(id,organization_id,event_id,status,total_minor,channel) values ('${sale}','${org}','${event}','confirmed',0,'rrpp');`);
  const firstAssign = await db.query<{ transfer_ticket_id: string; manual_code: string }>(
    `select * from assign_transfer_ticket('${route}','Pasajero Verif',null,'${sale}')`
  );
  await db.query(`select cancel_transfer_ticket('${firstAssign.rows[0].transfer_ticket_id}','no va')`);
  const secondAssign = await db.query<{ transfer_ticket_id: string; manual_code: string }>(
    `select * from assign_transfer_ticket('${route}','Pasajero Verif',null,'${sale}')`
  );
  assert.notEqual(secondAssign.rows[0].transfer_ticket_id, firstAssign.rows[0].transfer_ticket_id, "genera un pasaje nuevo, no devuelve el cancelado");
  assert.notEqual(secondAssign.rows[0].manual_code, firstAssign.rows[0].manual_code);
  assert.equal(await scalar(`select count(*)::int from transfer_tickets where sale_id='${sale}' and route_id='${route}'`), 2);

  void bartenderMember;
  await db.close();
});

test("venta en persona: tickets.manual_code no admite duplicados en el mismo evento, y create_sale/sell_table se frenan con rate limit", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  const admin = "c1111111-1111-4111-8111-111111111111";
  const org = "c2222222-2222-4222-8222-222222222222";
  const event = "c3333333-3333-4333-8333-333333333333";
  const ticketType = "c4444444-4444-4444-8444-444444444444";
  const table = "c5555555-5555-4555-8555-555555555555";

  await db.exec(`insert into auth.users values ('${admin}','admin-venta@example.test',now(),'{}');
    insert into platform_admins(user_id) values ('${admin}');
    insert into organizations(id,name,slug) values ('${org}','Club Venta','club-venta');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into ticket_types(id,event_id,name,price_minor,capacity,active,status) values ('${ticketType}','${event}','General',5000,10,true,'available');
    insert into bar_tables(id,event_id,name,capacity,price_minor) values ('${table}','${event}','Mesa 1',6,8000);
    select set_config('request.jwt.claim.sub','${admin}',false);`);

  // Union unico real: dos entradas del mismo evento no pueden terminar con
  // el mismo codigo (antes no habia ninguna restriccion versionada -- la
  // busqueda por codigo en validate_ticket_manual/redeem_combo_ticket no
  // tenia red de seguridad si alguna vez colisionaba).
  const firstTicket = await scalar(
    `insert into tickets(sale_id,event_id,ticket_type_id,status,manual_code) values (null,'${event}','${ticketType}','issued','DUPCODE1') returning id::text`
  );
  await assert.rejects(
    () => db.query(`insert into tickets(sale_id,event_id,ticket_type_id,status,manual_code) values (null,'${event}','${ticketType}','issued','dupcode1')`),
    /duplicate key|unique/i,
    "el mismo codigo (sin importar mayusculas) no puede repetirse en el mismo evento"
  );
  void firstTicket;

  // Rate limit: se precarga el balde ya en el limite para no tener que
  // llamar create_sale/sell_table 31 veces de verdad en el test.
  await db.exec(
    `insert into rate_limit_buckets(key, window_start, count) values ('sale-create:${admin}', now(), 30)`
  );
  await assert.rejects(
    () => db.query(`select * from create_sale('${event}','${ticketType}',1,'Cliente','Uno','30111111','3462111111',null,null)`),
    /Demasiados intentos/,
    "create_sale se frena con rate limit"
  );
  await assert.rejects(
    () => db.query(`select * from sell_table('${event}','${table}','Cliente','Uno','30111111','3462111111','efectivo')`),
    /Demasiados intentos/,
    "sell_table se frena con el mismo rate limit (misma clave, la cuota se comparte entre ambas formas de vender)"
  );

  await db.close();
});

test("claim_ticket_email_sent/release_ticket_email_sent/claim_whatsapp_sent/set_sale_last_reconciled: reclaman una sola vez", async () => {
  // Bug real encontrado probando en vivo: service_role NO tiene permiso de
  // UPDATE directo sobre sales en produccion (solo funciones security
  // definer pueden mutarla) -- el codigo de la app hacia
  // admin.from("sales").update(...) directo en 4 lugares, que siempre
  // fallaba con "permission denied" sin que nada lo chequeara, asi que el
  // envio automatico de entradas por mail NUNCA se intentaba. Este harness
  // de tests NO reproduce esa restriccion (mas abajo se ve por que:
  // service_role tiene GRANT ALL de fabrica), asi que estos tests no
  // hubieran detectado el bug original -- lo que si prueban es que las
  // funciones nuevas (el reemplazo correcto) reclaman/liberan bien.
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  const org = "d1111111-1111-4111-8111-111111111111";
  const event = "d2222222-2222-4222-8222-222222222222";
  const buyer = "d3333333-3333-4333-8333-333333333333";
  const sale = "d4444444-4444-4444-8444-444444444444";

  await db.exec(`insert into organizations(id,name,slug) values ('${org}','Club Claim','club-claim');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into buyers(id,organization_id,first_name,last_name) values ('${buyer}','${org}','Cliente','Claim');
    insert into sales(id,organization_id,event_id,buyer_id,status,total_minor,channel) values ('${sale}','${org}','${event}','${buyer}','pending_approval',5000,'online');`);

  // claim_ticket_email_sent: la primera vez reclama y devuelve la fila.
  const firstClaim = await db.query<{ id: string; event_id: string; buyer_id: string }>(
    `select * from claim_ticket_email_sent('${sale}')`
  );
  assert.equal(firstClaim.rows.length, 1, "la primera vez reclama");
  assert.equal(firstClaim.rows[0].buyer_id, buyer);
  assert.ok(await scalar(`select ticket_email_sent_at from sales where id='${sale}'`), "queda guardada la marca");

  // Reclamar de nuevo sin force: no hay fila (ya estaba reclamado).
  const secondClaim = await db.query(`select * from claim_ticket_email_sent('${sale}')`);
  assert.equal(secondClaim.rows.length, 0, "un segundo reclamo sin force no encuentra nada para reclamar");

  // release_ticket_email_sent: libera el reclamo (ej. el envio real fallo).
  await db.query(`select release_ticket_email_sent('${sale}')`);
  assert.equal(await scalar(`select ticket_email_sent_at from sales where id='${sale}'`), null);

  // Ahora si se puede reclamar de nuevo.
  const thirdClaim = await db.query(`select * from claim_ticket_email_sent('${sale}')`);
  assert.equal(thirdClaim.rows.length, 1, "liberado el reclamo, se puede reclamar de nuevo");

  // force=true reclama SIEMPRE, aunque ya este reclamado (reenvio manual).
  const forcedClaim = await db.query(`select * from claim_ticket_email_sent('${sale}', true)`);
  assert.equal(forcedClaim.rows.length, 1, "force reclama sin importar el estado previo");

  // claim_whatsapp_sent: mismo patron, devuelve boolean en vez de fila.
  assert.equal(await scalar(`select claim_whatsapp_sent('${sale}')`), true, "primera vez: reclama");
  assert.equal(await scalar(`select claim_whatsapp_sent('${sale}')`), false, "segunda vez: ya estaba reclamado");

  // set_sale_last_reconciled: guarda la marca (usada para el cooldown de "Verificar mi pago").
  assert.equal(await scalar(`select last_reconciled_at from sales where id='${sale}'`), null);
  await db.query(`select set_sale_last_reconciled('${sale}')`);
  assert.ok(await scalar(`select last_reconciled_at from sales where id='${sale}'`), "queda guardada la marca de reconciliacion");

  await db.close();
});

test("plan gestion avanzada y prueba de 7 dias del modulo de stock", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  const orgTrial = "b1111111-1111-4111-8111-111111111111";
  const orgAvanzada = "b2222222-2222-4222-8222-222222222222";
  const orgExpired = "b3333333-3333-4333-8333-333333333333";
  const basicPlan = "b4444444-4444-4444-8444-444444444444";
  const signupTrial = "b5555555-5555-4555-8555-555555555555";
  const signupAvanzada = "b6666666-6666-4666-8666-666666666666";
  const signupExpired = "b7777777-7777-4777-8777-777777777777";

  const avanzadaPlan = await scalar(`select id::text from subscription_plans where code = 'gestion_avanzada'`);
  assert.ok(avanzadaPlan, "la migracion debe crear el plan gestion_avanzada");
  assert.equal(await scalar(`select price_minor from subscription_plans where code = 'gestion_avanzada'`), 190000);

  await db.exec(`insert into organizations(id,name,slug) values ('${orgTrial}','Club Trial','club-trial');
    insert into organizations(id,name,slug) values ('${orgAvanzada}','Club Avanzada','club-avanzada');
    insert into organizations(id,name,slug) values ('${orgExpired}','Club Vencido','club-vencido');
    insert into subscription_plans(id,code,name,price_minor) values ('${basicPlan}','gestion_basica','Gestión básica',10000);
    insert into subscription_signups(id,plan_id,organization_id,first_name,last_name,organization_name,email,expected_amount,expected_currency,frequency_months)
      values ('${signupTrial}','${basicPlan}','${orgTrial}','Org','Test','Club Trial','trial@example.test',10000,'ARS',1);
    insert into subscription_signups(id,plan_id,organization_id,first_name,last_name,organization_name,email,expected_amount,expected_currency,frequency_months)
      values ('${signupAvanzada}','${avanzadaPlan}','${orgAvanzada}','Org','Test','Club Avanzada','avanzada@example.test',190000,'ARS',1);
    insert into subscription_signups(id,plan_id,organization_id,first_name,last_name,organization_name,email,expected_amount,expected_currency,frequency_months)
      values ('${signupExpired}','${basicPlan}','${orgExpired}','Org','Test','Club Vencido','vencido@example.test',10000,'ARS',1);`);

  // Basica recien activada: todavia no toco el modulo de stock, no debe existir ninguna prueba.
  await db.query(`select cp_record_payment('${signupTrial}','pay-trial','approved',10000,'ARS',now(),now())`);
  assert.equal(await scalar(`select count(*)::int from stock_trial where organization_id = '${orgTrial}'`), 0, "la prueba no arranca sola al pagar");

  // La primera vez que abre/usa el modulo de stock, recien ahi arranca la prueba de 7 dias.
  assert.equal(await scalar(`select cp_org_has_stock_access('${orgTrial}')`), true);
  assert.equal(await scalar(`select count(*)::int from stock_trial where organization_id = '${orgTrial}'`), 1, "el primer uso crea la prueba");

  // Gestion avanzada: acceso a stock sin depender de ninguna prueba.
  await db.query(`select cp_record_payment('${signupAvanzada}','pay-avanzada','approved',190000,'ARS',now(),now())`);
  assert.equal(await scalar(`select cp_org_has_stock_access('${orgAvanzada}')`), true);
  assert.equal(await scalar(`select count(*)::int from stock_trial where organization_id = '${orgAvanzada}'`), 0, "gestion avanzada no necesita fila de prueba");

  // Basica con la prueba ya vencida: pierde el acceso a stock (pero sigue con el servicio activo para entradas).
  await db.query(`select cp_record_payment('${signupExpired}','pay-vencido','approved',10000,'ARS',now(),now())`);
  assert.equal(await scalar(`select cp_org_has_service('${orgExpired}')`), true, "la suscripcion basica sigue activa");
  assert.equal(await scalar(`select cp_org_has_stock_access('${orgExpired}')`), true, "primera vez que usa stock, arranca la prueba recien ahora");
  await db.exec(`update stock_trial set starts_at = now() - interval '10 days', ends_at = now() - interval '3 days' where organization_id = '${orgExpired}'`);
  assert.equal(await scalar(`select cp_org_has_stock_access('${orgExpired}')`), false, "la prueba de stock ya vencio");

  // Un segundo cobro (renovacion) no reinicia la prueba ya usada.
  await db.query(`select cp_record_payment('${signupExpired}','pay-vencido-2','approved',10000,'ARS',now(),now() + interval '1 month')`);
  assert.equal(await scalar(`select count(*)::int from stock_trial where organization_id = '${orgExpired}'`), 1, "la prueba no se duplica ni se reinicia");
  assert.equal(await scalar(`select cp_org_has_stock_access('${orgExpired}')`), false, "sigue vencida tras renovar la basica");

  // Un usuario autenticado (JWT real, no service_role) que NO es miembro de
  // la organizacion no puede arrancarle la prueba de 7 dias aunque conozca
  // su UUID -- antes cualquier usuario logueado podia llamar este RPC
  // directo con el organization_id de otra organizacion.
  const orgAjena = "b8888888-8888-4888-8888-888888888888";
  const intruso = "b9999999-9999-4999-8999-999999999999";
  await db.exec(`insert into organizations(id,name,slug) values ('${orgAjena}','Club Ajeno','club-ajeno');
    insert into auth.users values ('${intruso}','intruso@example.test',now(),'{}');`);
  await db.exec(`select set_config('request.jwt.claim.sub','${intruso}',false);
    select set_config('request.jwt.claim.role','authenticated',false);`);
  assert.equal(await scalar(`select cp_org_has_stock_access('${orgAjena}')`), false, "un usuario ajeno no puede consultar/arrancar la prueba de otra organizacion");
  assert.equal(await scalar(`select count(*)::int from stock_trial where organization_id = '${orgAjena}'`), 0, "no se le crea una prueba a la organizacion ajena");
  await db.exec(`select set_config('request.jwt.claim.sub','',false);
    select set_config('request.jwt.claim.role','',false);`);

  await db.close();
});

test("upgrade de plan basica -> avanzada: cobra solo la diferencia prorrateada", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  const org = "c1111111-1111-4111-8111-111111111111";
  const organizerUser = "c2222222-2222-4222-8222-222222222222";
  const basicPlan = "c3333333-3333-4333-8333-333333333333";
  const signup = "c4444444-4444-4444-8444-444444444444";
  const basicPrice = 10000;

  const avanzadaId = await scalar(`select id::text from subscription_plans where code = 'gestion_avanzada'`);
  assert.ok(avanzadaId, "el plan gestion_avanzada debe existir");

  await db.exec(`insert into auth.users values ('${organizerUser}','upgrade-org@example.test',now(),'{}');
    insert into organizations(id,name,slug) values ('${org}','Club Upgrade','club-upgrade');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${organizerUser}','organizer','active');
    insert into subscription_plans(id,code,name,price_minor) values ('${basicPlan}','basica-upgrade-test','Básica test',${basicPrice});
    insert into subscription_signups(id,plan_id,organization_id,first_name,last_name,organization_name,email,expected_amount,expected_currency,frequency_months)
      values ('${signup}','${basicPlan}','${org}','Org','Test','Club Upgrade','upgrade-org@example.test',${basicPrice},'ARS',1);`);

  // Pago aprobado hace 15 dias de un periodo de 1 mes: quedan ~15 dias, o sea ~mitad del periodo.
  await db.query(`select cp_record_payment('${signup}','pay-basica-upgrade','approved',${basicPrice},'ARS', now() - interval '15 days', now())`);
  assert.equal(await scalar(`select cp_org_has_service('${org}')`), true);

  const chargeResult = await db.query<{ result: { id: string; amount_minor: number; currency: string; checkout_url: string | null } }>(
    `select cp_prepare_plan_upgrade('${organizerUser}','${avanzadaId}') as result`
  );
  const charge = chargeResult.rows[0].result;
  assert.ok(charge.id, "debe crear un cobro de actualizacion");
  assert.equal(charge.checkout_url, null);
  // Diferencia completa (190000-10000=180000) prorrateada a ~mitad de periodo: cerca de 90000.
  assert.ok(charge.amount_minor > 80000 && charge.amount_minor < 100000, `el monto prorrateado deberia rondar 90000, dio ${charge.amount_minor}`);

  // Doble click / reintento: reutiliza el mismo cobro pendiente, no crea uno nuevo.
  const secondCall = await db.query<{ result: { id: string } }>(
    `select cp_prepare_plan_upgrade('${organizerUser}','${avanzadaId}') as result`
  );
  assert.equal(secondCall.rows[0].result.id, charge.id, "no debe duplicar el cobro pendiente");
  assert.equal(await scalar(`select count(*)::int from plan_upgrade_charges where organization_id = '${org}'`), 1);

  // Se aprueba el pago de la diferencia (sin haber tocado nunca el modulo de stock antes).
  await db.query(`select cp_apply_upgrade_payment('${charge.id}','mp-payment-upgrade-1','approved',${charge.amount_minor},'ARS', now())`);
  assert.equal(await scalar(`select status from plan_upgrade_charges where id = '${charge.id}'`), "approved");
  assert.equal(await scalar(`select cp_org_has_stock_access('${org}')`), true, "el upgrade pagado da acceso solo, sin necesitar la prueba");
  assert.equal(await scalar(`select count(*)::int from stock_trial where organization_id = '${org}'`), 0, "el upgrade no debe crear ni gastar la prueba de 7 dias");

  // No se puede volver a pagar el mismo upgrade para el mismo periodo.
  await assert.rejects(
    () => db.query(`select cp_prepare_plan_upgrade('${organizerUser}','${avanzadaId}')`),
    /Ya actualizaste tu plan/
  );

  // Reintento del webhook (mismo pago aplicado dos veces) es un no-op seguro.
  await db.query(`select cp_apply_upgrade_payment('${charge.id}','mp-payment-upgrade-1','approved',${charge.amount_minor},'ARS', now())`);
  assert.equal(await scalar(`select count(*)::int from plan_upgrade_charges where id = '${charge.id}' and status = 'approved'`), 1);

  // Reembolso/contracargo sobre el MISMO pago ya aprobado: debe revertir el
  // acceso (antes quedaba 'approved' para siempre sin importar reembolsos).
  await db.query(`select cp_apply_upgrade_payment('${charge.id}','mp-payment-upgrade-1','refunded',${charge.amount_minor},'ARS', now())`);
  assert.equal(await scalar(`select status from plan_upgrade_charges where id = '${charge.id}'`), "rejected");
  // cp_org_has_stock_access recalcula en vivo contra este status, asi que
  // ya no cuenta este cargo como aprobado (una prueba de 7 dias no
  // estrenada puede seguir dando acceso por otro lado, eso es correcto).
  assert.equal(
    await scalar(`select exists(select 1 from plan_upgrade_charges where organization_id = '${org}' and status = 'approved')`),
    false, "el reembolso debe quitar el cargo aprobado que daba acceso"
  );

  // Un aviso de reembolso de OTRO pago (distinto payment_id) no debe poder
  // revertir un cargo ajeno.
  await db.query(`update plan_upgrade_charges set status='approved', mercadopago_payment_id='mp-payment-upgrade-1' where id='${charge.id}'`);
  await db.query(`select cp_apply_upgrade_payment('${charge.id}','otro-payment-id','refunded',${charge.amount_minor},'ARS', now())`);
  assert.equal(await scalar(`select status from plan_upgrade_charges where id = '${charge.id}'`), "approved", "un pago distinto no debe poder revertir el acceso ya otorgado");

  await db.close();
});

test("upgrade de plan: usa lo que se pago (no el precio de lista) y recalcula si el monto queda viejo", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  const org = "c5555555-5555-4555-8555-555555555555";
  const organizerUser = "c6666666-6666-4666-8666-666666666666";
  const basicPlan = "c7777777-7777-4777-8777-777777777777";
  const signup = "c8888888-8888-4888-8888-888888888888";
  const paidPrice = 10000;

  const avanzadaId = await scalar(`select id::text from subscription_plans where code = 'gestion_avanzada'`);

  await db.exec(`insert into auth.users values ('${organizerUser}','upgrade-stale@example.test',now(),'{}');
    insert into organizations(id,name,slug) values ('${org}','Club Stale','club-stale');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${organizerUser}','organizer','active');
    insert into subscription_plans(id,code,name,price_minor) values ('${basicPlan}','basica-stale-test','Básica test',${paidPrice});
    insert into subscription_signups(id,plan_id,organization_id,first_name,last_name,organization_name,email,expected_amount,expected_currency,frequency_months)
      values ('${signup}','${basicPlan}','${org}','Org','Test','Club Stale','upgrade-stale@example.test',${paidPrice},'ARS',1);`);

  await db.query(`select cp_record_payment('${signup}','pay-stale-basica','approved',${paidPrice},'ARS', now() - interval '15 days', now())`);

  // El admin sube el precio de lista del plan basico DESPUES de que la
  // organizacion ya pago -- el prorrateo debe seguir usando lo que
  // realmente se pago (10000), no el precio nuevo.
  await db.exec(`update subscription_plans set price_minor = 15000 where id = '${basicPlan}'`);

  const first = await db.query<{ result: { id: string; amount_minor: number } }>(
    `select cp_prepare_plan_upgrade('${organizerUser}','${avanzadaId}') as result`
  );
  // (190000-10000)*~0.5 ~= 90000, no (190000-15000)*~0.5 ~= 87500 -- la diferencia
  // entre ambos calculos alcanza para distinguir cual precio se uso.
  assert.ok(first.rows[0].result.amount_minor > 88000, `debe prorratear contra lo pagado (10000), no el precio de lista nuevo (15000); dio ${first.rows[0].result.amount_minor}`);

  // Alguien abre el checkout (queda con checkout_url) y no completa el pago.
  await db.query(`select cp_save_upgrade_checkout('${first.rows[0].result.id}', 'https://mercadopago.example/checkout-viejo')`);

  // El admin despues ajusta el precio de Gestion avanzada -- si se vuelve a
  // pedir el mismo upgrade (mismo periodo), el monto tiene que recalcularse
  // con el precio nuevo, no reusar el que se calculo la primera vez.
  // (el link tiene mas de una hora: dentro de la hora se reusa tal cual)
  await db.exec(`update subscription_plans set price_minor = 100000 where code = 'gestion_avanzada';
    update plan_upgrade_charges set created_at = now() - interval '2 hours' where id = '${first.rows[0].result.id}';`);
  const second = await db.query<{ result: { id: string; amount_minor: number; checkout_url: string | null } }>(
    `select cp_prepare_plan_upgrade('${organizerUser}','${avanzadaId}') as result`
  );
  assert.notEqual(second.rows[0].result.id, first.rows[0].result.id, "el cobro con link viejo se reemplaza por uno nuevo");
  // (100000-10000)*~0.5 ~= 45000, bien distinto del ~90000 original.
  assert.ok(second.rows[0].result.amount_minor < 55000, `debe recalcular con el precio nuevo, no reusar el monto viejo; dio ${second.rows[0].result.amount_minor}`);
  assert.equal(second.rows[0].result.checkout_url, null, "el cobro nuevo todavia no tiene link");
  assert.equal(await scalar(`select status from plan_upgrade_charges where id = '${first.rows[0].result.id}'`), "superseded");

  // Si igual paga el link VIEJO (con su monto viejo), se aprueba por su
  // propio monto -- antes el monto se pisaba y ese pago no coincidia nunca.
  const oldAmount = Number(first.rows[0].result.amount_minor);
  await db.query(`select cp_apply_upgrade_payment('${first.rows[0].result.id}','mp-old-link','approved',${oldAmount},'ARS', now())`);
  assert.equal(await scalar(`select status from plan_upgrade_charges where id = '${first.rows[0].result.id}'`), "approved");

  await db.exec(`update subscription_plans set price_minor = 190000 where code = 'gestion_avanzada'`);

  await db.close();
});

test("combos (entrada + consumicion) y packs de entradas", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "d1111111-1111-4111-8111-111111111111";
  const event = "d2222222-2222-4222-8222-222222222222";
  const organizerUser = "d3333333-3333-4333-8333-333333333333";
  const bartenderUser = "d4444444-4444-4444-8444-444444444444";
  const bar = "d5555555-5555-4555-8555-555555555555";
  const eventProductFernet = "d6666666-6666-4666-8666-666666666666";
  const eventProductCoca = "d7777777-7777-4777-8777-777777777777";
  const ticketTypeGeneral = "d8888888-8888-4888-8888-888888888888";
  const ticketTypeVip = "d9999999-9999-4999-8999-999999999999";
  const ticketTypePremium = "daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const pack = "dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const plan = "dccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const signup = "ddddddd1-dddd-4ddd-8ddd-ddddddddddd1";

  await db.exec(`insert into auth.users values ('${organizerUser}','combo-org@example.test',now(),'{}');
    insert into auth.users values ('${bartenderUser}','combo-bartender@example.test',now(),'{}');
    insert into organizations(id,name,slug) values ('${org}','Club Combos','club-combos');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into subscription_plans(id,code,name,price_minor) values ('${plan}','monthly-combo','Mensual',10000);
    insert into subscription_signups(id,plan_id,organization_id,first_name,last_name,organization_name,email,expected_amount,expected_currency,frequency_months)
      values ('${signup}','${plan}','${org}','Org','Test','Club Combos','combo-org@example.test',10000,'ARS',1);`);

  await db.query("select cp_record_payment($1,'combo-test-payment','approved',10000,'ARS',now(),now())", [signup]);

  await db.exec(`insert into organization_members(organization_id,user_id,role,status) values ('${org}','${organizerUser}','organizer','active');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${bartenderUser}','bartender','active');`);
  const bartenderMember = await scalar(`select id::text from organization_members where user_id = '${bartenderUser}'`);

  const fernetProductId = await scalar(`select id::text from products where name like 'Fernet Branca%' limit 1`);
  const cocaProductId = await scalar(`select id::text from products where name like 'Coca-Cola%' limit 1`);
  assert.ok(fernetProductId && cocaProductId, "el catalogo global debe traer Fernet y Coca-Cola precargados");

  await db.exec(`insert into event_products(id,event_id,product_id,cost_price_minor,sale_price_minor,profit_margin_percent,total_stock,low_stock_threshold)
      values ('${eventProductFernet}','${event}','${fernetProductId}',10000,2000,50,20,3);
    insert into event_products(id,event_id,product_id,cost_price_minor,sale_price_minor,profit_margin_percent,total_stock,low_stock_threshold)
      values ('${eventProductCoca}','${event}','${cocaProductId}',5000,1000,50,20,3);
    insert into bars(id,event_id,name) values ('${bar}','${event}','Barra 1');
    insert into event_staff(event_id,organization_member_id,staff_role,active,bar_id)
      values ('${event}','${bartenderMember}','bartender',true,'${bar}');
    insert into ticket_types(id,event_id,name,price_minor,capacity) values ('${ticketTypeGeneral}','${event}','General',5000,50);
    insert into ticket_types(id,event_id,name,price_minor,capacity,combo_type,combo_event_product_id,combo_quantity)
      values ('${ticketTypeVip}','${event}','VIP',15000,50,'producto','${eventProductFernet}',2);
    insert into ticket_types(id,event_id,name,price_minor,capacity,combo_type,combo_credit_minor)
      values ('${ticketTypePremium}','${event}','Premium',20000,50,'credito',5000);
    insert into ticket_packs(id,event_id,ticket_type_id,name,quantity_per_pack,price_minor)
      values ('${pack}','${event}','${ticketTypeGeneral}','Pack x3 General',3,13500);`);

  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false);`);

  // Un producto de otro evento no puede quedar configurado como combo (el trigger lo bloquea).
  await db.exec(`insert into events(id,organization_id,status) values ('deeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','${org}','active');
    insert into event_products(id,event_id,product_id,cost_price_minor,sale_price_minor,total_stock)
      values ('dfffffff-ffff-4fff-8fff-ffffffffffff','deeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','${fernetProductId}',10000,2000,10);`);
  await assert.rejects(
    () => db.query(`update ticket_types set combo_event_product_id = 'dfffffff-ffff-4fff-8fff-ffffffffffff' where id = '${ticketTypeGeneral}'`),
    /mismo evento/
  );

  // Venta normal (sin combo, sin pack): regresion del comportamiento de siempre.
  const plainSale = await db.query<{ sale_id: string; total_minor: string; tickets_created: number }>(
    `select * from create_sale('${event}','${ticketTypeGeneral}',2,'Cliente','General','30111111','3462111111',null)`
  );
  assert.equal(Number(plainSale.rows[0].total_minor), 10000, "2 generales a 5000");
  assert.equal(plainSale.rows[0].tickets_created, 2);
  assert.equal(await scalar(`select count(*)::int from tickets where sale_id = '${plainSale.rows[0].sale_id}' and combo_remaining_quantity is null and combo_remaining_credit_minor is null`), 2);

  // Idempotencia: un reintento con la MISMA clave (ej. el vendedor de
  // puerta reintenta tras perder la respuesta por un corte de wifi) no
  // debe crear una segunda venta ni descontar cupo de nuevo.
  const doorSaleKey = "c0ffee00-0000-4000-8000-000000000099";
  const doorSaleFirst = await db.query<{ sale_id: string; total_minor: string; tickets_created: number }>(
    `select * from create_sale('${event}','${ticketTypeGeneral}',3,'Cliente','Puerta','30777777','3462777777',null,'efectivo',null,'${doorSaleKey}')`
  );
  const doorSaleRetry = await db.query<{ sale_id: string; total_minor: string; tickets_created: number }>(
    `select * from create_sale('${event}','${ticketTypeGeneral}',3,'Cliente','Puerta','30777777','3462777777',null,'efectivo',null,'${doorSaleKey}')`
  );
  assert.equal(doorSaleRetry.rows[0].sale_id, doorSaleFirst.rows[0].sale_id, "el reintento devuelve la MISMA venta, no crea una nueva");
  assert.equal(doorSaleRetry.rows[0].tickets_created, 3);
  assert.equal(await scalar(`select count(*)::int from sales where buyer_id = (select buyer_id from sales where id = '${doorSaleFirst.rows[0].sale_id}')`), 1, "no se duplico la venta");
  assert.equal(await scalar(`select count(*)::int from tickets where sale_id = '${doorSaleFirst.rows[0].sale_id}'`), 3, "no se duplicaron las entradas ni se desconto cupo dos veces");

  // Venta de un pack: 1 pack de "Pack x3 General" genera 3 entradas de General,
  // cobra el precio del pack (no 3 x precio de lista), y prorratea el
  // unit_price_minor de sale_items para que siga cuadrando con el total.
  const packSale = await db.query<{ sale_id: string; total_minor: string; tickets_created: number }>(
    `select * from create_sale('${event}','${ticketTypeGeneral}',1,'Cliente','Pack','30222222','3462222222',null,null,'${pack}')`
  );
  assert.equal(Number(packSale.rows[0].total_minor), 13500, "el pack cobra su propio precio, no 3 x 5000");
  assert.equal(packSale.rows[0].tickets_created, 3);
  assert.equal(await scalar(`select count(*)::int from tickets where sale_id = '${packSale.rows[0].sale_id}'`), 3);
  assert.equal(await scalar(`select unit_price_minor from sale_items where sale_id = '${packSale.rows[0].sale_id}'`), 4500, "13500/3 = 4500 por entrada");
  assert.equal(await scalar(`select pack_id::text from sale_items where sale_id = '${packSale.rows[0].sale_id}'`), pack);

  // 2 packs a la vez = 6 entradas.
  const doublePack = await db.query<{ tickets_created: number }>(
    `select * from create_sale('${event}','${ticketTypeGeneral}',2,'Cliente','DoblePack','30333333','3462333333',null,null,'${pack}')`
  );
  assert.equal(doublePack.rows[0].tickets_created, 6);

  // Venta de una entrada VIP (combo tipo producto: incluye 2 Fernet).
  const vipSale = await db.query<{ sale_id: string }>(
    `select * from create_sale('${event}','${ticketTypeVip}',1,'Cliente','Vip','30444444','3462444444',null)`
  );
  const vipTicketId = await scalar(`select id::text from tickets where sale_id = '${vipSale.rows[0].sale_id}'`);
  assert.equal(await scalar(`select combo_remaining_quantity from tickets where id = '${vipTicketId}'`), 2);
  await db.exec(`update tickets set manual_code = 'VIPCODE1' where id = '${vipTicketId}'`);

  // Venta de una entrada Premium (combo tipo credito: incluye $5000).
  const premiumSale = await db.query<{ sale_id: string }>(
    `select * from create_sale('${event}','${ticketTypePremium}',1,'Cliente','Premium','30555555','3462555555',null)`
  );
  const premiumTicketId = await scalar(`select id::text from tickets where sale_id = '${premiumSale.rows[0].sale_id}'`);
  assert.equal(await scalar(`select combo_remaining_credit_minor from tickets where id = '${premiumTicketId}'`), 5000);
  await db.exec(`update tickets set manual_code = 'PREMIUMCODE1' where id = '${premiumTicketId}'`);

  // Al bartender le asignamos stock para poder canjear.
  await db.query(`select assign_stock_to_bar('${eventProductFernet}','${bar}',10)`);
  await db.query(`select assign_stock_to_bar('${eventProductCoca}','${bar}',10)`);

  await db.exec(`select set_config('request.jwt.claim.sub','${bartenderUser}',false);`);

  // Canjear el combo VIP: 1 de los 2 Fernet incluidos.
  const vipRedeemKey = "c0ffee00-0000-4000-8000-000000000002";
  const redeem1 = await db.query<{ ticket_id: string; product_name: string; quantity: number; remaining_quantity: number; remaining_credit_minor: string | null }>(
    `select * from redeem_combo_ticket('${bar}','VIPCODE1','${eventProductFernet}',1,'${vipRedeemKey}')`
  );
  assert.equal(redeem1.rows[0].remaining_quantity, 1, "quedaba 1 Fernet incluido despues de canjear 1 de 2");
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProductFernet}'`), 9, "canjear un combo si descuenta stock de la barra (a diferencia de un trago suelto)");
  assert.equal(await scalar(`select count(*)::int from bar_sales where ticket_id = '${vipTicketId}' and payment_method = 'combo'`), 1);

  // Reintento con la MISMA idempotency key (ej: bartender aprieta canjear
  // dos veces por un corte de red): no debe descontar stock/saldo de
  // nuevo ni crear una segunda fila en bar_sales.
  const retriedRedeem = await db.query<{ ticket_id: string; remaining_quantity: number }>(
    `select * from redeem_combo_ticket('${bar}','VIPCODE1','${eventProductFernet}',1,'${vipRedeemKey}')`
  );
  assert.equal(retriedRedeem.rows[0].ticket_id, vipTicketId);
  assert.equal(retriedRedeem.rows[0].remaining_quantity, 1, "el reintento no descuenta el saldo de nuevo (sigue en 1, no en 0)");
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProductFernet}'`), 9, "el reintento no descuenta stock de nuevo");
  assert.equal(await scalar(`select count(*)::int from bar_sales where ticket_id = '${vipTicketId}' and payment_method = 'combo'`), 1, "no se duplico la fila de canje");

  // Reintento con la MISMA key pero producto/cantidad DISTINTOS en el
  // request (ej: bug de UI, o el bartender cambio de bebida en la pantalla
  // antes de que el primer pedido terminara) -- la respuesta tiene que
  // reflejar lo que REALMENTE se descarto la primera vez (Fernet, 1), no
  // lo que pide este reintento (Coca, 5): antes armaba el recibo con
  // p_event_product_id/p_quantity del request nuevo.
  const retriedWithDifferentParams = await db.query<{ product_name: string; quantity: number }>(
    `select * from redeem_combo_ticket('${bar}','VIPCODE1','${eventProductCoca}',5,'${vipRedeemKey}')`
  );
  assert.equal(retriedWithDifferentParams.rows[0].quantity, 1, "el reintento devuelve la cantidad real canjeada la primera vez, no la del request nuevo");
  assert.match(retriedWithDifferentParams.rows[0].product_name, /Fernet/i, "el reintento devuelve el producto real canjeado la primera vez, no el del request nuevo");
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProductCoca}'`), 10, "el reintento con producto distinto tampoco toco el stock de ese otro producto");

  // No puede canjear un producto distinto al incluido en un combo tipo 'producto'.
  await assert.rejects(
    () => db.query(`select redeem_combo_ticket('${bar}','VIPCODE1','${eventProductCoca}',1)`),
    /no incluye ese producto/
  );

  // No puede canjear mas de lo que queda incluido (queda 1, pide 2).
  await assert.rejects(
    () => db.query(`select redeem_combo_ticket('${bar}','VIPCODE1','${eventProductFernet}',2)`),
    /Ya se canjeo/
  );

  // Canjear el credito Premium: gasta 2000 (1 Fernet) del saldo de 5000.
  const redeem2 = await db.query<{ remaining_credit_minor: string }>(
    `select * from redeem_combo_ticket('${bar}','PREMIUMCODE1','${eventProductFernet}',1)`
  );
  assert.equal(Number(redeem2.rows[0].remaining_credit_minor), 3000, "5000 - 2000 = 3000");

  // Con el credito puede canjear OTRO producto distinto (no esta atado a uno fijo).
  const redeem3 = await db.query<{ remaining_credit_minor: string }>(
    `select * from redeem_combo_ticket('${bar}','PREMIUMCODE1','${eventProductCoca}',1)`
  );
  assert.equal(Number(redeem3.rows[0].remaining_credit_minor), 2000, "3000 - 1000 = 2000");

  // No puede gastar mas credito del que le queda.
  await assert.rejects(
    () => db.query(`select redeem_combo_ticket('${bar}','PREMIUMCODE1','${eventProductFernet}',2)`),
    /No queda suficiente credito/
  );

  // Una entrada sin combo (General) no se puede canjear.
  const generalTicketId = await scalar(`select id::text from tickets where sale_id = '${plainSale.rows[0].sale_id}' limit 1`);
  await db.exec(`update tickets set manual_code = 'GENERALCODE1' where id = '${generalTicketId}'`);
  await assert.rejects(
    () => db.query(`select redeem_combo_ticket('${bar}','GENERALCODE1','${eventProductFernet}',1)`),
    /no incluye consumicion/
  );

  // Un bartender de otra barra (sin asignacion) no puede canjear.
  const otherBar = "e1111111-1111-4111-8111-111111111111";
  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false);
    insert into bars(id,event_id,name) values ('${otherBar}','${event}','Barra 2');`);
  await db.exec(`select set_config('request.jwt.claim.sub','${bartenderUser}',false);`);
  await assert.rejects(
    () => db.query(`select redeem_combo_ticket('${otherBar}','PREMIUMCODE1','${eventProductFernet}',1)`),
    /No estas asignado a esta barra/
  );

  // Cancelar un canje de combo tipo 'producto' devuelve el stock DE LA BARRA
  // (ya se probaba antes) Y el saldo INCLUIDO EN LA ENTRADA (esto es lo nuevo).
  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false);`);
  const vipRedeemSaleId = await scalar(`select id::text from bar_sales where ticket_id = '${vipTicketId}' and payment_method = 'combo'`);
  await db.query(`select cancel_bar_sale('${vipRedeemSaleId}','Bartender se equivoco de producto')`);
  assert.equal(await scalar(`select combo_remaining_quantity from tickets where id = '${vipTicketId}'`), 2, "vuelve a quedar el Fernet incluido sin canjear");
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProductFernet}'`), 9, "el stock de la barra tambien vuelve");

  // Mismo caso para un combo tipo 'credito': cancelar devuelve el credito gastado.
  const premiumCocaSaleId = await scalar(`select id::text from bar_sales where ticket_id = '${premiumTicketId}' and event_product_id = '${eventProductCoca}' and payment_method = 'combo'`);
  assert.equal(await scalar(`select combo_remaining_credit_minor from tickets where id = '${premiumTicketId}'`), 2000);
  await db.query(`select cancel_bar_sale('${premiumCocaSaleId}','Bartender se equivoco de producto')`);
  assert.equal(await scalar(`select combo_remaining_credit_minor from tickets where id = '${premiumTicketId}'`), 3000, "los $1000 de la Coca cancelada vuelven al credito de la entrada");

  // No se puede cancelar dos veces la misma venta.
  await assert.rejects(
    () => db.query(`select cancel_bar_sale('${vipRedeemSaleId}','De nuevo')`),
    /ya estaba cancelada/
  );

  // Ahora que volvio a tener 2 Fernet incluidos, se puede volver a canjear.
  await db.exec(`select set_config('request.jwt.claim.sub','${bartenderUser}',false);`);
  const redeemAfterCancel = await db.query<{ remaining_quantity: number }>(
    `select * from redeem_combo_ticket('${bar}','VIPCODE1','${eventProductFernet}',2)`
  );
  assert.equal(redeemAfterCancel.rows[0].remaining_quantity, 0, "se pueden volver a canjear los 2 Fernet completos");

  // Editar el combo de la tanda DESPUES de vender no debe romper el
  // canje de entradas ya emitidas: tienen que seguir validando contra lo
  // que el comprador realmente pago (snapshot en la entrada), no contra
  // la configuracion nueva de la tanda.
  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false);`);
  const vip2Sale = await db.query<{ sale_id: string }>(
    `select * from create_sale('${event}','${ticketTypeVip}',1,'Cliente','Vip2','30666666','3462666666',null)`
  );
  const vip2TicketId = await scalar(`select id::text from tickets where sale_id = '${vip2Sale.rows[0].sale_id}'`);
  await db.exec(`update tickets set manual_code = 'VIPCODE2' where id = '${vip2TicketId}'`);
  assert.equal(await scalar(`select combo_type from tickets where id = '${vip2TicketId}'`), "producto", "la entrada emitida guarda su propio snapshot del combo");
  assert.equal(await scalar(`select combo_event_product_id::text from tickets where id = '${vip2TicketId}'`), eventProductFernet);

  // El organizador cambia la tanda VIP de "incluye Fernet" a "incluye Coca".
  await db.exec(`update ticket_types set combo_event_product_id = '${eventProductCoca}' where id = '${ticketTypeVip}'`);

  await db.exec(`select set_config('request.jwt.claim.sub','${bartenderUser}',false);`);
  // La entrada ya vendida sigue canjeando Fernet (lo que el comprador
  // pago), no Coca (la configuracion nueva de la tanda).
  const redeemAfterEdit = await db.query<{ remaining_quantity: number }>(
    `select * from redeem_combo_ticket('${bar}','VIPCODE2','${eventProductFernet}',1)`
  );
  assert.equal(redeemAfterEdit.rows[0].remaining_quantity, 1, "sigue canjeando el Fernet que tenia incluido al momento de la venta");
  await assert.rejects(
    () => db.query(`select redeem_combo_ticket('${bar}','VIPCODE2','${eventProductCoca}',1)`),
    /no incluye ese producto/,
    "no debe aceptar el producto nuevo de la tanda editada -- la entrada ya vendida no cambio de combo"
  );

  // cancel_bar_sale tiene que restaurar el saldo de la entrada leyendo el
  // SNAPSHOT de la propia entrada (tickets.combo_type), no la
  // configuracion en vivo de la tanda -- si el organizador cambio el tipo
  // de combo de la tanda (producto -> credito) DESPUES del canje, cancelar
  // esa venta no debe perderse el saldo ni incrementar el campo
  // equivocado.
  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false);`);
  const vip2RedeemSaleId = await scalar(`select id::text from bar_sales where ticket_id = '${vip2TicketId}' and payment_method = 'combo'`);
  await db.exec(`update ticket_types set combo_type = 'credito', combo_event_product_id = null, combo_quantity = null, combo_credit_minor = 5000 where id = '${ticketTypeVip}'`);
  await db.query(`select cancel_bar_sale('${vip2RedeemSaleId}','Test cancelacion tras editar tipo de combo')`);
  assert.equal(
    await scalar(`select combo_remaining_quantity from tickets where id = '${vip2TicketId}'`),
    2,
    "restaura combo_remaining_quantity (el campo real de esta entrada) aunque la tanda ahora sea tipo credito"
  );
  assert.equal(
    await scalar(`select combo_remaining_credit_minor from tickets where id = '${vip2TicketId}'`),
    null,
    "no incrementa combo_remaining_credit_minor -- esta entrada nunca usa ese campo, su snapshot sigue siendo tipo producto"
  );

  // ==========================================================
  // process_ticket_return: el reintegro descuenta lo ya canjeado del
  // combo. vipTicketId termino con los 2 Fernet incluidos canjeados de
  // nuevo tras la cancelacion de arriba (2 x $2000 = $4000 activos; el
  // canje original de $2000 quedo cancelado y no cuenta).
  //
  // Esta primera llamada corre EXPLICITAMENTE como rol "authenticated" (no
  // solo con request.jwt.claim.sub, que el resto de este archivo suele usar
  // sin cambiar de rol) -- la ruta real del panel (app/api/entradas/devolver)
  // llama a este RPC con la sesion del organizador, que en Postgres es
  // literalmente el rol "authenticated". Sin esto, un "revoke" del grant a
  // "authenticated" en una migracion futura (ya paso una vez: 20261002 lo
  // piso sin querer) rompe todas las devoluciones en produccion sin que
  // ningun test lo note, porque el resto de las llamadas de este bloque
  // corren como superusuario y no respetan GRANT/REVOKE.
  // ==========================================================

  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false); set role authenticated;`);
  const vipReturn = await db.query<{
    return_id: string;
    refund_status: string;
    refund_amount_minor: string;
    ticket_status: string;
  }>(
    `select * from process_ticket_return('${vipTicketId}','Compro de mas','refunded',null)`
  );
  await db.exec("reset role;");
  assert.equal(Number(vipReturn.rows[0].refund_amount_minor), 11000, "15000 originales - 4000 activos consumidos del combo = 11000");
  assert.equal(vipReturn.rows[0].ticket_status, "cancelled");
  assert.equal(await scalar(`select status from tickets where id='${vipTicketId}'`), "cancelled");

  // No puede pedir mas de lo que quedo disponible para reintegrar.
  await assert.rejects(
    () => db.query(`select process_ticket_return('${premiumTicketId}','Otro motivo','refunded',999999)`),
    /no puede superar/
  );

  // No puede devolver dos veces la misma entrada.
  await assert.rejects(
    () => db.query(`select process_ticket_return('${vipTicketId}','De nuevo','refunded',null)`),
    /ya esta anulada|ya tiene una devolucion/
  );

  // No puede devolver una entrada ya usada.
  await db.exec(`update tickets set status = 'used', used_at = now() where id = '${premiumTicketId}'`);
  await assert.rejects(
    () => db.query(`select process_ticket_return('${premiumTicketId}','Ya se uso','no_refund',null)`),
    /ya fue utilizada/
  );

  await db.close();
});

test("presupuestos: estados revision/a_pagar y paquetes predeterminados", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  // "enviado" ya no es un estado valido: los presupuestos viejos con ese
  // valor se migran solos a "revision".
  await assert.rejects(
    () => db.query(`insert into quotes(client_name, status) values ('X', 'enviado')`),
    /violates check constraint|check/
  );

  await db.exec(`insert into quotes(client_name, status) values ('Y', 'revision');
    insert into quotes(client_name, status) values ('Z', 'a_pagar');`);
  assert.equal(await scalar(`select status from quotes where client_name = 'Y'`), "revision");
  assert.equal(await scalar(`select status from quotes where client_name = 'Z'`), "a_pagar");

  // Paquete predeterminado: nombre propio, contenido y precio fijo.
  await db.exec(`insert into quote_packages(kind, name, items, price_mode, package_price_minor)
    values ('diseno', 'Paquete Emprendedores', '[{"description":"Flyer semanal","quantity":4,"unit":"u","unit_price_minor":0}]', 'package', 60000)`);
  assert.equal(await scalar(`select count(*)::int from quote_packages`), 1);
  assert.equal(await scalar(`select name from quote_packages`), "Paquete Emprendedores");

  const packageId = await scalar(`select id::text from quote_packages where name = 'Paquete Emprendedores'`);
  await db.exec(`update quote_packages set package_price_minor = 65000 where id = '${packageId}'`);
  assert.equal(Number(await scalar(`select package_price_minor from quote_packages where id = '${packageId}'`)), 65000, "se puede editar el paquete si cambia algo");

  await assert.rejects(
    () => db.query(`insert into quote_packages(name, items) values ('X', '{"a":1}')`),
    /violates check constraint|check/
  );

  // Las notas por defecto de un paquete (texto largo del servicio) se
  // pueden guardar y editar sin limite fijado por la base.
  await db.exec(`update quote_packages set notes = 'Detalle largo del servicio...' where id = '${packageId}'`);
  assert.equal(await scalar(`select notes from quote_packages where id = '${packageId}'`), "Detalle largo del servicio...");

  await db.close();
});

test("cuenta de cortesia: servicio y stock completos sin pagar", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  const orgFree = "d1111111-1111-4111-8111-111111111111";
  const orgPaid = "d2222222-2222-4222-8222-222222222222";

  await db.exec(`insert into organizations(id,name,slug) values ('${orgFree}','Cliente Estudio','cliente-estudio');
    insert into organizations(id,name,slug) values ('${orgPaid}','Sin Pagar','sin-pagar');`);

  assert.equal(await scalar(`select cp_org_has_service('${orgFree}')`), false, "sin marca y sin pago no hay servicio");

  await db.exec(`update organizations set complimentary = true, complimentary_note = 'Cliente del estudio' where id = '${orgFree}'`);
  assert.equal(await scalar(`select cp_org_has_service('${orgFree}')`), true, "la cuenta de cortesia tiene servicio sin pagar");
  assert.equal(await scalar(`select cp_org_has_stock_access('${orgFree}')`), true, "y el pack completo, incluido stock");

  await db.exec(`update organizations set stock_access_blocked = true where id = '${orgFree}'`);
  assert.equal(await scalar(`select cp_org_has_stock_access('${orgFree}')`), false, "el admin puede bloquear stock sin tocar la cortesia");
  assert.equal(await scalar(`select cp_org_has_service('${orgFree}')`), true, "el resto del servicio sigue activo");

  await db.exec(`update organizations set stock_access_blocked = false where id = '${orgFree}'`);
  assert.equal(await scalar(`select cp_org_has_stock_access('${orgFree}')`), true, "se puede desbloquear de nuevo");
  assert.equal(await scalar(`select count(*)::int from stock_trial where organization_id = '${orgFree}'`), 0, "sin abrir una prueba de 7 dias");

  assert.equal(await scalar(`select cp_org_has_service('${orgPaid}')`), false, "otra organizacion no se ve afectada");
  assert.equal(await scalar(`select cp_org_has_stock_access('${orgPaid}')`), false);

  await db.exec(`update organizations set active = false where id = '${orgFree}'`);
  assert.equal(await scalar(`select cp_org_has_service('${orgFree}')`), false, "desactivar la organizacion corta el acceso aunque sea de cortesia");

  await db.close();
});

test("color de la entrada: solo acepta un hexadecimal valido", async () => {
  const db = await database();
  const org = "d3333333-3333-4333-8333-333333333333";
  const event = "d4444444-4444-4444-8444-444444444444";

  await db.exec(`insert into organizations(id,name,slug) values ('${org}','Color Org','color-org');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');`);

  await db.exec(`update events set ticket_accent_color = '#8b5cf6' where id = '${event}'`);
  const saved = await db.query<{ ticket_accent_color: string }>(`select ticket_accent_color from events where id = '${event}'`);
  assert.equal(saved.rows[0].ticket_accent_color, "#8b5cf6");

  await db.exec(`update events set ticket_accent_color = null where id = '${event}'`);

  for (const invalid of ["rojo", "#fff", "#gggggg", "ff3b24", "#ff3b24; drop table events"]) {
    await assert.rejects(
      () => db.query(`update events set ticket_accent_color = '${invalid}' where id = '${event}'`),
      /events_ticket_accent_color_check|violates check constraint/,
      `debe rechazar ${invalid}`
    );
  }

  await db.close();
});

test("presencia: cp_touch_presence marca last_active_at del usuario logueado", async () => {
  const db = await database();
  const user = "e5555555-5555-4555-8555-555555555555";
  const other = "e6666666-6666-4666-8666-666666666666";

  await db.exec(`insert into auth.users values ('${user}','presencia@example.test',now(),'{}');
    insert into auth.users values ('${other}','otro@example.test',now(),'{}');
    insert into profiles(id, first_name, last_name) values ('${user}','Presencia','Test'), ('${other}','Otro','Test');`);

  await db.exec(`select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`);
  await db.exec(`select cp_touch_presence()`);
  await db.exec(`reset role;`);

  const rows = await db.query<{ id: string; last_active_at: string | null }>(`select id, last_active_at from profiles order by id`);
  const mine = rows.rows.find((r) => r.id === user);
  const others = rows.rows.find((r) => r.id === other);
  assert.ok(mine?.last_active_at, "se marco la presencia del usuario logueado");
  assert.equal(others?.last_active_at ?? null, null, "no toca la presencia de otro usuario");

  // Un UPDATE directo (no via cp_touch_presence) no puede pisar
  // last_active_at, sin importar que privilegios de UPDATE tenga
  // "authenticated" sobre la tabla -- se simula aca el caso mas permisivo
  // (grant de tabla completa, el habitual por defecto en Supabase) para
  // probar que el trigger protege igual.
  await db.exec("grant update on public.profiles to authenticated;");
  const before = String((await db.query<{ last_active_at: string }>(`select last_active_at from profiles where id = '${user}'`)).rows[0].last_active_at);
  await db.exec(`select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`);
  await db.query(`update profiles set first_name = 'Editado', last_active_at = now() + interval '1 year' where id = '${user}'`);
  await db.exec("reset role;");
  const after = await db.query<{ first_name: string; last_active_at: string }>(`select first_name, last_active_at from profiles where id = '${user}'`);
  assert.equal(after.rows[0].first_name, "Editado", "el resto de los campos del propio perfil si se pueden editar");
  assert.equal(String(after.rows[0].last_active_at), before, "last_active_at no se movio ni un click, aunque el UPDATE directo no dio ningun error");

  // Limites de largo en first_name/last_name/phone -- antes no tenian ninguno.
  await assert.rejects(
    () => db.exec(`update profiles set first_name = repeat('x', 201) where id = '${user}'`),
    /profiles_first_name_length|violates check constraint/
  );
  await assert.rejects(
    () => db.exec(`update profiles set phone = repeat('1', 61) where id = '${user}'`),
    /profiles_phone_length|violates check constraint/
  );

  await db.close();
});

test("presupuestos: numera en orden y valida tipo, estado y descuento", async () => {
  const db = await database();

  await db.exec(`insert into quotes(client_name, kind, items) values ('Cliente Uno', 'diseno', '[{"description":"Logo","quantity":1,"unit":"u","unit_price_minor":150000}]');
    insert into quotes(client_name, kind) values ('Cliente Dos', 'rental');`);

  const rows = await db.query<{ number: number; client_name: string; status: string }>(`select number, client_name, status from quotes order by number`);
  assert.equal(rows.rows.length, 2);
  assert.equal(rows.rows[1].number, rows.rows[0].number + 1, "el numero de presupuesto avanza de a uno");
  assert.equal(rows.rows[0].status, "borrador");

  await db.exec(`insert into quotes(client_name, kind, event_name, modality, price_mode, package_price_minor, discount_type, discount_value, discount_label)
    values ('Primavera Estudiantil', 'diseno', 'Fiesta de la primavera', 'mensual', 'package', 200000, 'percent', 10, 'Cliente mensual')`);
  const design = await db.query<{ price_mode: string; package_price_minor: string }>(`select price_mode, package_price_minor from quotes where event_name is not null`);
  assert.equal(design.rows[0].price_mode, "package");
  assert.equal(Number(design.rows[0].package_price_minor), 200000);

  const invalids = [
    `insert into quotes(client_name, kind) values ('X', 'otra-cosa')`,
    `insert into quotes(client_name, status) values ('X', 'pagado')`,
    `insert into quotes(client_name, discount_type) values ('X', 'mitad')`,
    `insert into quotes(client_name, discount_value) values ('X', -5)`,
    `insert into quotes(client_name, modality) values ('X', 'semanal')`,
    `insert into quotes(client_name, price_mode) values ('X', 'regalo')`,
    `insert into quotes(client_name, package_price_minor) values ('X', -1)`,
    `insert into quotes(client_name, items) values ('X', '{"a":1}')`,
    `insert into quote_catalog(description, unit_price_minor) values ('X', -1)`,
  ];
  for (const sql of invalids) {
    await assert.rejects(() => db.query(sql), /violates check constraint|check/, `debe rechazar: ${sql}`);
  }

  await db.close();
});

test("presupuestos: status_changed_at solo cambia cuando cambia el status (no con cualquier edicion)", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  const id = await scalar(`insert into quotes(client_name, kind, status) values ('Cliente Reloj', 'diseno', 'a_pagar') returning id::text`);
  const firstChangedAt = await scalar(`select status_changed_at from quotes where id='${id}'`);
  assert.notEqual(firstChangedAt, null, "se rellena solo al crear (backfill/default)");

  // Pasa un poco el tiempo para que un timestamp distinto sea detectable.
  await db.exec(`update quotes set status_changed_at = status_changed_at - interval '20 days' where id='${id}'`);
  const backdated = String(await scalar(`select status_changed_at from quotes where id='${id}'`));

  // Editar algo que NO es el status (ej. corregir las notas) no lo toca.
  await db.exec(`update quotes set notes = 'corrijo un typo' where id='${id}'`);
  assert.equal(String(await scalar(`select status_changed_at from quotes where id='${id}'`)), backdated, "una edicion cualquiera no resetea el reloj del vencimiento");

  // Cambiar el status SI lo actualiza a ahora.
  await db.exec(`update quotes set status = 'aceptado' where id='${id}'`);
  const afterStatusChange = String(await scalar(`select status_changed_at from quotes where id='${id}'`));
  assert.notEqual(afterStatusChange, backdated, "cambiar el status si actualiza el reloj");

  await db.close();
});

test("comisiones de RRPP: la tabla recuperada existe, con idempotencia contra pagos duplicados", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "e1e1e1e1-1111-4111-8111-111111111111";
  const event = "e1e1e1e1-2222-4222-8222-222222222222";
  const user = "e1e1e1e1-3333-4333-8333-333333333333";

  await db.exec(`insert into auth.users values ('${user}','rrpp-pago@example.test',now(),'{}');
    insert into organizations(id,name,slug) values ('${org}','Club Comision','club-comision');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${user}','rrpp','active');`);
  const member = await scalar(`select id::text from organization_members where user_id='${user}'`);
  const staff = await scalar(`insert into event_staff(event_id,organization_member_id,staff_role,commission_percentage) values ('${event}','${member}','rrpp',10) returning id::text`);

  const key = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const insertPayment = () =>
    db.exec(`insert into rrpp_commission_payments(organization_id, event_id, event_staff_id, organization_member_id, amount_minor, idempotency_key)
      values ('${org}','${event}','${staff}','${member}', 5000, '${key}')`);
  await insertPayment();
  await assert.rejects(insertPayment(), /duplicate key|unique/i, "la misma clave de idempotencia no puede insertar dos pagos");

  assert.equal(Number(await scalar(`select count(*)::int from rrpp_commission_payments`)), 1);
  await assert.rejects(
    () => db.exec(`insert into rrpp_commission_payments(organization_id, event_id, event_staff_id, organization_member_id, amount_minor) values ('${org}','${event}','${staff}','${member}', -100)`),
    /check constraint/,
    "el monto tiene que ser positivo"
  );

  await db.close();
});

test("presupuestos: directorio de clientes reutilizable", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  await db.exec(`insert into quote_clients(name, contact, phone, email) values ('Bar Los Alamos', 'Maria Fernandez', '+54 9 11 5555-1234', 'maria@losalamos.com')`);
  assert.equal(await scalar(`select count(*)::int from quote_clients`), 1);
  assert.equal(await scalar(`select name from quote_clients`), "Bar Los Alamos");

  const clientId = await scalar(`select id::text from quote_clients where name = 'Bar Los Alamos'`);
  await db.exec(`update quote_clients set phone = '+54 9 11 9999-0000' where id = '${clientId}'`);
  assert.equal(await scalar(`select phone from quote_clients where id = '${clientId}'`), "+54 9 11 9999-0000");

  await db.exec(`delete from quote_clients where id = '${clientId}'`);
  assert.equal(await scalar(`select count(*)::int from quote_clients`), 0);

  await db.close();
});

test("control de ingreso: validate_ticket_manual valida, bloquea doble uso y registra el metodo", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  const org = "f1111111-1111-4111-8111-111111111111";
  const event = "f2222222-2222-4222-8222-222222222222";
  const controllerUser = "f3333333-3333-4333-8333-333333333333";
  const buyer = "f4444444-4444-4444-8444-444444444444";
  const sale = "f5555555-5555-4555-8555-555555555555";
  const ticketType = "f6666666-6666-4666-8666-666666666666";
  const ticket = "f7777777-7777-4777-8777-777777777777";
  const cancelledTicket = "f8888888-8888-4888-8888-888888888888";

  await db.exec(`insert into auth.users values ('${controllerUser}','control-test@example.test',now(),'{}');
    insert into organizations(id,name,slug,complimentary) values ('${org}','Club Control','club-control',true);
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${controllerUser}','controller','active');`);

  const controllerMemberId = await scalar(`select id::text from organization_members where user_id = '${controllerUser}'`);
  await db.exec(`insert into event_staff(event_id,organization_member_id,staff_role,active) values ('${event}','${controllerMemberId}','controller',true);
    insert into buyers(id,organization_id,first_name,last_name,dni) values ('${buyer}','${org}','Juan','Perez','30111222');
    insert into sales(id,organization_id,event_id,buyer_id,status,total_minor) values ('${sale}','${org}','${event}','${buyer}','confirmed',5000);
    insert into ticket_types(id,event_id,name,price_minor,capacity) values ('${ticketType}','${event}','General',5000,10);
    insert into tickets(id,sale_id,event_id,ticket_type_id,status,manual_code) values ('${ticket}','${sale}','${event}','${ticketType}','issued','ABC123');
    insert into tickets(id,sale_id,event_id,ticket_type_id,status,manual_code) values ('${cancelledTicket}','${sale}','${event}','${ticketType}','cancelled','DEF456');`);

  await db.exec(`select set_config('request.jwt.claim.sub','${controllerUser}',false);`);

  // Metodo invalido: rechazado antes de tocar nada.
  await assert.rejects(
    () => db.query(`select validate_ticket_manual('${event}','ABC123','otro_metodo')`),
    /Metodo de validacion invalido/
  );

  // Primer escaneo: valida, marca la entrada como usada, registra method='qr'.
  const first = await db.query<{ result: string; ticket_id: string }>(
    `select * from validate_ticket_manual('${event}','ABC123','qr')`
  );
  assert.equal(first.rows[0].result, "valid");
  assert.equal(await scalar(`select status from tickets where id = '${ticket}'`), "used");
  assert.equal(await scalar(`select method from entry_scans where ticket_id = '${ticket}' and result = 'valid'`), "qr");

  // Reintento (ej. dos controladores casi simultaneos, o sincronizacion offline de un escaneo ya validado en vivo): already_used.
  const second = await db.query<{ result: string }>(
    `select * from validate_ticket_manual('${event}','ABC123','qr_offline')`
  );
  assert.equal(second.rows[0].result, "already_used", "el lock evita el doble ingreso aunque el metodo sea distinto");
  assert.equal(
    await scalar(`select count(*)::int from entry_scans where ticket_id = '${ticket}' and result = 'already_used' and method = 'qr_offline'`),
    1,
    "el reintento queda registrado con SU PROPIO metodo (qr_offline), no pisa el registro original"
  );

  // Entrada anulada.
  const cancelled = await db.query<{ result: string }>(
    `select * from validate_ticket_manual('${event}','DEF456','manual_offline')`
  );
  assert.equal(cancelled.rows[0].result, "cancelled");

  // Entrada 'issued' de una venta reembolsada: la puerta la rechaza igual.
  const refundedSale = "f9999999-9999-4999-8999-999999999999";
  await db.exec(`insert into sales(id,organization_id,event_id,buyer_id,status,total_minor) values ('${refundedSale}','${org}','${event}','${buyer}','refunded',5000);
    insert into tickets(sale_id,event_id,ticket_type_id,status,manual_code) values ('${refundedSale}','${event}','${ticketType}','issued','GHI789');`);
  const refunded = await db.query<{ result: string }>(
    `select * from validate_ticket_manual('${event}','GHI789','qr')`
  );
  assert.equal(refunded.rows[0].result, "cancelled", "una venta reembolsada no puede dejar entrar");
  assert.equal(await scalar(`select status from tickets where manual_code = 'GHI789'`), "issued", "rechazar no la marca como usada");

  // Codigo inexistente.
  const invalid = await db.query<{ result: string; ticket_id: string | null }>(
    `select * from validate_ticket_manual('${event}','NOEXISTE','manual')`
  );
  assert.equal(invalid.rows[0].result, "invalid");
  assert.equal(invalid.rows[0].ticket_id, null);

  // Rate limit: a diferencia del escaneo de QR (protegido en la API route),
  // el codigo manual se llama directo por RPC sin ningun freno propio -- se
  // precarga el balde ya en el limite para no tener que escanear 121 veces
  // de verdad en el test.
  await db.exec(
    `insert into rate_limit_buckets(key, window_start, count) values ('ticket-validate:${controllerUser}', now(), 120)
     on conflict (key) do update set window_start = now(), count = 120`
  );
  await assert.rejects(
    () => db.query(`select validate_ticket_manual('${event}','NOEXISTE','manual')`),
    /Demasiados intentos/,
    "el codigo manual tambien se frena con rate limit, igual que el camino de QR"
  );

  await db.close();
});

test("comision de RRPP: se congela en la venta, editar el % despues no cambia lo ya vendido", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "33333333-3333-4333-8333-333333333333";
  const event = "44444444-4444-4444-8444-444444444444";
  const rrppUser = "55555555-5555-4555-8555-555555555555";
  const ticketType = "66666666-6666-4666-8666-666666666666";

  await db.exec(`insert into auth.users values ('${rrppUser}','rrpp@example.test',now(),'{}');
    insert into organizations(id,name,slug,complimentary) values ('${org}','Club RRPP','club-rrpp',true);
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into ticket_types(id,event_id,name,price_minor,capacity,active,status)
      values ('${ticketType}','${event}','General',10000,50,true,'available');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${rrppUser}','rrpp','active');`);

  const rrppMember = await scalar(`select id::text from organization_members where user_id = '${rrppUser}'`);
  await db.exec(`insert into event_staff(event_id,organization_member_id,staff_role,active,commission_percentage)
    values ('${event}','${rrppMember}','rrpp',true,15);
    select set_config('request.jwt.claim.sub','${rrppUser}',false);`);

  const firstSale = await scalar(
    `select sale_id::text from create_sale('${event}','${ticketType}',1,'Cliente','Uno','30111111','3462111111',null,'efectivo')`
  );
  assert.equal(Number(await scalar(`select commission_percentage_snapshot from sales where id='${firstSale}'`)), 15, "la venta congela el % vigente al momento de vender");

  // El organizador baja la comision DESPUES de esta primera venta.
  await db.exec(`update event_staff set commission_percentage = 5 where organization_member_id = '${rrppMember}'`);

  const secondSale = await scalar(
    `select sale_id::text from create_sale('${event}','${ticketType}',1,'Cliente','Dos','30222222','3462222222',null,'efectivo')`
  );
  assert.equal(Number(await scalar(`select commission_percentage_snapshot from sales where id='${secondSale}'`)), 5, "la venta nueva usa el % ya actualizado");
  assert.equal(
    Number(await scalar(`select commission_percentage_snapshot from sales where id='${firstSale}'`)),
    15,
    "la venta vieja NO cambia retroactivamente cuando se edita el % despues"
  );

  // Una mesa que vende el RRPP tambien congela su % (le da comision).
  const table = await scalar(`insert into bar_tables(event_id,name,capacity,price_minor) values ('${event}','Mesa VIP',6,80000) returning id::text`);
  const tableSale = await scalar(
    `select sale_id::text from sell_table('${event}','${table}','Cliente','Mesa','30333333','3462333333','efectivo')`
  );
  assert.equal(Number(await scalar(`select commission_percentage_snapshot from sales where id='${tableSale}'`)), 5, "la mesa vendida por un RRPP le da comision");

  // La misma mesa vendida por el organizador no genera comision.
  const organizerUser = "57575757-5757-4575-8575-575757575757";
  await db.exec(`insert into auth.users values ('${organizerUser}','org-rrpp@example.test',now(),'{}');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${organizerUser}','organizer','active');
    select set_config('request.jwt.claim.sub','${organizerUser}',false);`);
  const table2 = await scalar(`insert into bar_tables(event_id,name,capacity,price_minor) values ('${event}','Mesa 2',6,50000) returning id::text`);
  const organizerTableSale = await scalar(
    `select sale_id::text from sell_table('${event}','${table2}','Cliente','Org','30444444','3462444444','efectivo')`
  );
  assert.equal(await scalar(`select commission_percentage_snapshot from sales where id='${organizerTableSale}'`), null, "si vende el organizador, no hay comision");

  await db.close();
});

test("ventas online: un pago tardio no sobrevende si el carrito tenia 2 lineas de la misma tanda", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const admin = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const org = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const event = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const ticketType = "22222222-2222-4222-8222-222222222222";
  const buyer = (n: string) => `'Comprador','${n}','30${n}','3462${n}',null`;

  await db.exec(`insert into auth.users values ('${admin}','admin@example.test',now(),'{}');
    insert into platform_admins(user_id) values ('${admin}');
    insert into organizations(id,name,slug) values ('${org}','Club','club');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into ticket_types(id,event_id,name,price_minor,capacity,active,status)
      values ('${ticketType}','${event}','General',5000,3,true,'available');
    insert into organization_mercadopago_accounts(organization_id,mp_user_id,access_token,refresh_token,expires_at)
      values ('${org}', 999, 'tok', 'ref', now() + interval '1 day');
    select set_config('request.jwt.claim.sub','${admin}',false);`);

  // Carrito con 2 LINEAS de la misma tanda (ej. entradas sueltas + un pack
  // que resuelve a la misma tanda -- acá se simplifica a 2 lineas sueltas,
  // que es exactamente lo que create_online_sale ya soporta y valida de
  // forma acumulativa al crearse).
  const twoLineCart = `'[{"ticket_type_id":"${ticketType}","quantity":1},{"ticket_type_id":"${ticketType}","quantity":1}]'::jsonb`;
  const staleSale = await scalar(`select sale_id::text from create_online_sale('${event}', ${twoLineCart}, ${buyer("111111")})`);
  assert.equal(await scalar(`select count(*)::int from sale_items where sale_id='${staleSale}'`), 2, "el carrito genero 2 sale_items para la misma tanda");

  // El cron de 30 minutos la cancela antes de que llegue la confirmacion del pago.
  await db.exec(`update sales set created_at = now() - interval '40 minutes' where id='${staleSale}'`);
  assert.equal(await scalar("select cp_cancel_stale_online_sales()"), 1);
  assert.equal(await scalar(`select status from sales where id='${staleSale}'`), "cancelled");

  // Mientras tanto, otro comprador se queda con 2 de las 3 entradas de cupo real.
  const otherCart = `'[{"ticket_type_id":"${ticketType}","quantity":2}]'::jsonb`;
  const otherSale = await scalar(`select sale_id::text from create_online_sale('${event}', ${otherCart}, ${buyer("222222")})`);
  await db.query("select confirm_online_sale($1,'approved')", [otherSale]);
  assert.equal(await scalar(`select count(*)::int from tickets where ticket_type_id='${ticketType}' and status <> 'cancelled'`), 2);

  // Pago tardio del carrito original (efectivo/Pago Facil): con solo 1 lugar
  // libre y 2 lineas de 1 entrada cada una para la misma tanda, NO debe
  // sobrevender -- cada linea "pasaria" el chequeo por separado si no se
  // suman entre si antes de comparar contra el cupo.
  await db.query("select confirm_online_sale($1,'approved')", [staleSale]);
  assert.equal(
    await scalar(`select status from sales where id='${staleSale}'`),
    "cancelled",
    "no debe revivir la venta: sumadas, las 2 lineas piden mas cupo del que queda"
  );
  assert.equal(
    await scalar(`select count(*)::int from tickets where ticket_type_id='${ticketType}' and status <> 'cancelled'`),
    2,
    "no se debe haber emitido ninguna entrada de mas para esta tanda"
  );

  await db.close();
});

test("organizations.new_subscription_notified_at se reclama una sola vez (evita spam del push de nueva suscripcion)", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "77777777-7777-4777-8777-777777777777";

  await db.exec(`insert into organizations(id,name,slug) values ('${org}','Club Push','club-push')`);
  assert.equal(await scalar(`select new_subscription_notified_at from organizations where id='${org}'`), null);

  const claim = async (n: string) => {
    const result = await db.query<{ id: string }>(
      `update organizations set new_subscription_notified_at = '${n}' where id='${org}' and new_subscription_notified_at is null returning id`
    );
    return result.rows;
  };

  // Simula 2 llamadas a applyPayment casi simultaneas para el primer pago
  // aprobado de la organizacion (ej. el polling de /cuenta y un reintento
  // del webhook) -- solo la primera debe "ganar" la marca.
  assert.equal((await claim("2026-01-01T00:00:00Z")).length, 1, "la primera llamada reclama la marca y manda el push");
  assert.equal((await claim("2026-01-01T00:00:01Z")).length, 0, "la segunda llamada no encuentra nada para actualizar -- no reenvia el push");
  assert.equal(
    Number(await scalar(`select extract(epoch from new_subscription_notified_at) from organizations where id='${org}'`)),
    Date.parse("2026-01-01T00:00:00Z") / 1000,
    "la marca queda fija en la primera reclamacion, la segunda no la pisa"
  );

  await db.close();
});

test("finanzas: cobros contra un presupuesto y gastos, con sus validaciones", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  const quote = await db.query<{ id: string }>(
    `insert into quotes(client_name, kind, status, items) values ('Bar Los Alamos', 'rental', 'a_pagar', '[{"description":"Terminal","quantity":1,"unit":"mes","unit_price_minor":50000}]') returning id`
  );
  const quoteId = quote.rows[0].id;

  await db.exec(`insert into quote_payments(quote_id, amount_minor, paid_at, method) values ('${quoteId}', 20000, '2026-01-05', 'efectivo')`);
  assert.equal(Number(await scalar(`select sum(amount_minor)::text from quote_payments where quote_id='${quoteId}'`)), 20000);

  // Un pago no puede quedar sin presupuesto ni sin monto positivo.
  await assert.rejects(() => db.query(`insert into quote_payments(quote_id, amount_minor) values ('${quoteId}', -100)`), /violates check constraint|check/);
  await assert.rejects(() => db.query(`insert into quote_payments(quote_id, amount_minor) values (gen_random_uuid(), 1000)`), /violates foreign key constraint|foreign key/);

  // Si se borra el presupuesto, sus cobros se van con el (on delete cascade).
  await db.exec(`delete from quotes where id='${quoteId}'`);
  assert.equal(await scalar(`select count(*)::int from quote_payments where quote_id='${quoteId}'`), 0);

  // Gastos: valida kind y amount_minor positivo.
  await db.exec(`insert into expenses(kind, category, description, amount_minor, expense_date) values ('rental', 'insumos', 'Cinta para impresora', 5000, '2026-01-02')`);
  assert.equal(await scalar(`select count(*)::int from expenses`), 1);
  await assert.rejects(() => db.query(`insert into expenses(kind, description, amount_minor) values ('otro-tipo', 'X', 100)`), /violates check constraint|check/);
  await assert.rejects(() => db.query(`insert into expenses(kind, description, amount_minor) values ('general', 'X', 0)`), /violates check constraint|check/);

  await db.close();
});

test("catalogo: historial de precios encadena por catalog_id y valida el monto", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  const item = await db.query<{ id: string }>(`insert into quote_catalog(description, unit_price_minor) values ('Flyer preventa', 15000) returning id`);
  const catalogId = item.rows[0].id;

  await db.exec(`insert into quote_catalog_price_history(catalog_id, unit_price_minor) values ('${catalogId}', 15000)`);
  await db.exec(`insert into quote_catalog_price_history(catalog_id, unit_price_minor) values ('${catalogId}', 18000)`);
  assert.equal(await scalar(`select count(*)::int from quote_catalog_price_history where catalog_id='${catalogId}'`), 2);

  await assert.rejects(() => db.query(`insert into quote_catalog_price_history(catalog_id, unit_price_minor) values ('${catalogId}', -1)`), /violates check constraint|check/);
  await assert.rejects(() => db.query(`insert into quote_catalog_price_history(catalog_id, unit_price_minor) values (gen_random_uuid(), 1000)`), /violates foreign key constraint|foreign key/);

  // Si se borra el item del catalogo, su historial se va con el.
  await db.exec(`delete from quote_catalog where id='${catalogId}'`);
  assert.equal(await scalar(`select count(*)::int from quote_catalog_price_history where catalog_id='${catalogId}'`), 0);

  await db.close();
});

test("packs mensuales: un mismo pack no puede tener 2 facturas del mismo mes", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  const pack = await db.query<{ id: string }>(
    `insert into monthly_packs(client_name, kind, description, package_price_minor) values ('Bar Los Alamos', 'diseno', 'Flyers del mes', 150000) returning id`
  );
  const packId = pack.rows[0].id;

  await db.exec(`insert into quotes(client_name, kind, status, monthly_pack_id, pack_period, price_mode, package_price_minor)
    values ('Bar Los Alamos', 'diseno', 'a_pagar', '${packId}', '2026-03-01', 'package', 150000)`);
  assert.equal(await scalar(`select count(*)::int from quotes where monthly_pack_id='${packId}'`), 1);

  // El mismo pack, mismo mes: el indice unico lo frena (asi la ruta de
  // generar puede confiar en que un 23505 significa "ya existe", no error real).
  await assert.rejects(
    () => db.query(`insert into quotes(client_name, kind, status, monthly_pack_id, pack_period, price_mode, package_price_minor)
      values ('Bar Los Alamos', 'diseno', 'a_pagar', '${packId}', '2026-03-01', 'package', 150000)`),
    /duplicate key value violates unique constraint/
  );

  // Un mes distinto para el mismo pack si es valido.
  await db.exec(`insert into quotes(client_name, kind, status, monthly_pack_id, pack_period, price_mode, package_price_minor)
    values ('Bar Los Alamos', 'diseno', 'a_pagar', '${packId}', '2026-04-01', 'package', 150000)`);
  assert.equal(await scalar(`select count(*)::int from quotes where monthly_pack_id='${packId}'`), 2);

  await db.close();
});

test("cierre mensual: no se puede cerrar el mismo mes 2 veces", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  await db.exec(`insert into monthly_closures(period, presupuestado_minor, facturado_minor, cobrado_minor, pendiente_minor, gastos_minor, resultado_minor)
    values ('2026-03-01', 500000, 400000, 300000, 100000, 50000, 250000)`);
  assert.equal(await scalar(`select resultado_minor from monthly_closures where period='2026-03-01'`), 250000);

  await assert.rejects(
    () => db.query(`insert into monthly_closures(period, presupuestado_minor, facturado_minor, cobrado_minor, pendiente_minor, gastos_minor, resultado_minor)
      values ('2026-03-01', 0, 0, 0, 0, 0, 0)`),
    /duplicate key value violates unique constraint/
  );

  // Reabrir (borrar) permite volver a cerrar ese mismo mes despues.
  await db.exec(`delete from monthly_closures where period='2026-03-01'`);
  await db.exec(`insert into monthly_closures(period, presupuestado_minor, facturado_minor, cobrado_minor, pendiente_minor, gastos_minor, resultado_minor)
    values ('2026-03-01', 600000, 500000, 500000, 0, 100000, 400000)`);
  assert.equal(await scalar(`select resultado_minor from monthly_closures where period='2026-03-01'`), 400000);

  await db.close();
});

test("sistema de traslados: cupo, permisos y validacion de embarque", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "99999999-9999-4999-8999-999999999999";
  const event = "aaaaaaaa-1111-4111-8111-111111111111";
  const rrppUser = "aaaaaaaa-2222-4222-8222-222222222222";
  const otherRrppUser = "aaaaaaaa-3333-4333-8333-333333333333";

  await db.exec(`insert into auth.users values ('${rrppUser}','rrpp-traslado@example.test',now(),'{}'), ('${otherRrppUser}','otro-rrpp@example.test',now(),'{}');
    insert into organizations(id,name,slug) values ('${org}','Club Traslados','club-traslados');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${rrppUser}','rrpp','active'), ('${org}','${otherRrppUser}','rrpp','active');`);

  const rrppMember = await scalar(`select id::text from organization_members where user_id='${rrppUser}'`);
  const otherMember = await scalar(`select id::text from organization_members where user_id='${otherRrppUser}'`);
  await db.exec(`insert into event_staff(event_id,organization_member_id,staff_role,active) values
    ('${event}','${rrppMember}','rrpp',true), ('${event}','${otherMember}','rrpp',true)`);

  const route = await scalar(
    `insert into transfer_routes(event_id, organization_member_id, name, capacity) values ('${event}','${rrppMember}','Colectivo Once',1) returning id::text`
  );

  await db.exec(`select set_config('request.jwt.claim.sub','${rrppUser}',false)`);
  const firstAssign = await db.query<{ transfer_ticket_id: string; manual_code: string }>(
    `select * from assign_transfer_ticket('${route}','Juan Perez','3460000001')`
  );
  assert.equal(firstAssign.rows.length, 1, "el dueño del colectivo puede sumar un pasajero");
  const code = firstAssign.rows[0].manual_code;

  // Cupo lleno: el colectivo tiene capacidad 1 y ya tiene un pasajero.
  await assert.rejects(
    () => db.query(`select * from assign_transfer_ticket('${route}','Otro Pasajero','3460000002')`),
    /completo/,
    "no deja sumar un pasajero mas alla del cupo"
  );

  // Otro RRPP (no dueño de este colectivo) no puede sumarle pasajeros.
  await db.exec(`select set_config('request.jwt.claim.sub','${otherRrppUser}',false)`);
  await assert.rejects(
    () => db.query(`select * from assign_transfer_ticket('${route}','Intruso','3460000003')`),
    /permiso/,
    "un RRPP que no es dueño del colectivo no puede sumarle pasajeros"
  );

  // El mismo RRPP dueño SI puede validar el embarque.
  await db.exec(`select set_config('request.jwt.claim.sub','${rrppUser}',false)`);
  const valid = await db.query<{ result: string; passenger_name: string }>(
    `select * from validate_transfer_ticket('${route}','${code}')`
  );
  assert.equal(valid.rows[0].result, "valid");
  assert.equal(valid.rows[0].passenger_name, "Juan Perez");

  // Escanear el mismo codigo de nuevo: ya uso, no se vuelve a dejar pasar.
  const reused = await db.query<{ result: string }>(`select * from validate_transfer_ticket('${route}','${code}')`);
  assert.equal(reused.rows[0].result, "already_used");

  // Codigo que no existe.
  const invalid = await db.query<{ result: string }>(`select * from validate_transfer_ticket('${route}','ZZZZZZ')`);
  assert.equal(invalid.rows[0].result, "invalid");

  await db.close();
});

test("colectivos: cancelar libera el cupo e invalida el codigo, y el escaneo se frena con rate limit", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "aaaaaaaa-9999-4999-8999-999999999998";
  const event = "aaaaaaaa-9999-4999-8999-999999999997";
  const rrppUser = "aaaaaaaa-9999-4999-8999-999999999996";
  const otherRrppUser = "aaaaaaaa-9999-4999-8999-999999999995";

  await db.exec(`insert into auth.users values ('${rrppUser}','rrpp-cancela@example.test',now(),'{}'), ('${otherRrppUser}','otro-cancela@example.test',now(),'{}');
    insert into organizations(id,name,slug) values ('${org}','Club Cancela','club-cancela');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${rrppUser}','rrpp','active'), ('${org}','${otherRrppUser}','rrpp','active');`);

  const rrppMember = await scalar(`select id::text from organization_members where user_id='${rrppUser}'`);
  const otherMember = await scalar(`select id::text from organization_members where user_id='${otherRrppUser}'`);
  await db.exec(`insert into event_staff(event_id,organization_member_id,staff_role,active) values
    ('${event}','${rrppMember}','rrpp',true), ('${event}','${otherMember}','rrpp',true)`);

  const route = await scalar(
    `insert into transfer_routes(event_id, organization_member_id, name, capacity) values ('${event}','${rrppMember}','Colectivo Cancela',1) returning id::text`
  );

  await db.exec(`select set_config('request.jwt.claim.sub','${rrppUser}',false)`);
  const assign = await db.query<{ transfer_ticket_id: string; manual_code: string }>(
    `select * from assign_transfer_ticket('${route}','Se Baja','3460000009')`
  );
  const ticketId = assign.rows[0].transfer_ticket_id;
  const code = assign.rows[0].manual_code;

  // El colectivo esta al cupo: no deja sumar otro pasajero mas.
  await assert.rejects(
    () => db.query(`select * from assign_transfer_ticket('${route}','No Entra')`),
    /completo/
  );

  // Un RRPP que no es dueño del colectivo no puede cancelar un pasaje ajeno.
  await db.exec(`select set_config('request.jwt.claim.sub','${otherRrppUser}',false)`);
  await assert.rejects(
    () => db.query(`select * from cancel_transfer_ticket('${ticketId}', 'no va')`),
    /permiso/
  );

  // El dueño del colectivo SI puede cancelar.
  await db.exec(`select set_config('request.jwt.claim.sub','${rrppUser}',false)`);
  await db.query(`select * from cancel_transfer_ticket('${ticketId}', 'avisó que no va')`);
  assert.equal(await scalar(`select status from transfer_tickets where id='${ticketId}'`), "cancelled");

  // Cancelar de nuevo el mismo pasaje no es posible.
  await assert.rejects(
    () => db.query(`select * from cancel_transfer_ticket('${ticketId}', 'de nuevo')`),
    /ya esta cancelado/
  );

  // El cupo quedo libre: ahora si se puede sumar a otro pasajero.
  const secondAssign = await db.query<{ manual_code: string }>(
    `select * from assign_transfer_ticket('${route}','Si Entra','3460000010')`
  );
  assert.equal(secondAssign.rows.length, 1, "cancelar libera el cupo para un nuevo pasajero");

  // El codigo cancelado quedo invalido para siempre (no solo "no encontrado").
  const scanCancelled = await db.query<{ result: string }>(`select * from validate_transfer_ticket('${route}','${code}')`);
  assert.equal(scanCancelled.rows[0].result, "cancelled");

  // Un pasaje ya embarcado ("used") no se puede cancelar.
  const newCode = secondAssign.rows[0].manual_code;
  await db.query(`select * from validate_transfer_ticket('${route}','${newCode}')`);
  const newTicketId = await scalar(`select id::text from transfer_tickets where manual_code='${newCode}'`);
  await assert.rejects(
    () => db.query(`select * from cancel_transfer_ticket('${newTicketId}', 'ya subio')`),
    /ya embarco/
  );

  // Rate limit del escaneo: se precarga el balde ya en el limite (120 en
  // la ventana) para no tener que escanear 121 veces de verdad en el test.
  await db.exec(
    `insert into rate_limit_buckets(key, window_start, count) values ('transfer-validate:${rrppUser}', now(), 120)
     on conflict (key) do update set window_start = now(), count = 120`
  );
  await assert.rejects(
    () => db.query(`select * from validate_transfer_ticket('${route}','ZZZZZZ')`),
    /Demasiados intentos/,
    "el escaneo de codigos se frena con rate limit igual que las demas validaciones sensibles"
  );

  await db.close();
});

test("colectivo general: cualquier RRPP del evento lo puede usar (antes solo el organizador podia)", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "aaaaaaaa-5555-4555-8555-555555555555";
  const event = "aaaaaaaa-6666-4666-8666-666666666666";
  const rrppUser = "aaaaaaaa-7777-4777-8777-777777777777";
  const outsiderUser = "aaaaaaaa-8888-4888-8888-888888888888";

  await db.exec(`insert into auth.users values ('${rrppUser}','rrpp-general@example.test',now(),'{}'), ('${outsiderUser}','outsider-general@example.test',now(),'{}');
    insert into organizations(id,name,slug) values ('${org}','Club General','club-general');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${rrppUser}','rrpp','active');`);
  // outsiderUser NO es miembro de esta organizacion.

  // organization_member_id null = colectivo "general", sin RRPP dueño.
  const route = await scalar(`insert into transfer_routes(event_id, organization_member_id, name, capacity) values ('${event}', null, 'Colectivo General', 2) returning id::text`);
  const stop = await scalar(`insert into transfer_route_stops(route_id, position, name) values ('${route}', 1, 'Terminal') returning id::text`);

  await db.exec(`select set_config('request.jwt.claim.sub','${rrppUser}',false)`);
  const assign = await db.query<{ manual_code: string }>(`select * from assign_transfer_ticket('${route}','Pasajero General',null,null,'${stop}')`);
  assert.equal(assign.rows.length, 1, "un RRPP cualquiera del evento puede sumar un pasajero a un colectivo general");

  const validate = await db.query<{ result: string }>(`select * from validate_transfer_ticket('${route}','${assign.rows[0].manual_code}')`);
  assert.equal(validate.rows[0].result, "valid", "y tambien puede validar el embarque");

  const mark = await db.query<{ current_stop_id: string }>(`select * from transfer_mark_stop('${route}', '${stop}')`);
  assert.equal(mark.rows[0].current_stop_id, stop, "y marcar la parada a mano");

  // Alguien que NO es miembro de la organizacion sigue sin poder tocarlo.
  await db.exec(`select set_config('request.jwt.claim.sub','${outsiderUser}',false)`);
  await assert.rejects(
    () => db.query(`select * from assign_transfer_ticket('${route}','Intruso')`),
    /permiso/,
    "alguien ajeno a la organizacion sigue sin poder usar el colectivo general"
  );

  await db.close();
});

test("seguimiento del colectivo: el escaneo mueve la posicion sin retroceder, marca manual y reinicio", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "b1b1b1b1-1111-4111-8111-111111111111";
  const event = "b1b1b1b1-2222-4222-8222-222222222222";
  const ownerUser = "b1b1b1b1-3333-4333-8333-333333333333";
  const otherUser = "b1b1b1b1-4444-4444-8444-444444444444";

  await db.exec(`insert into auth.users values ('${ownerUser}','owner-bus@example.test',now(),'{}'), ('${otherUser}','other-bus@example.test',now(),'{}');
    insert into organizations(id,name,slug) values ('${org}','Club Bus','club-bus');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${ownerUser}','rrpp','active'), ('${org}','${otherUser}','rrpp','active');`);
  const owner = await scalar(`select id::text from organization_members where user_id='${ownerUser}'`);
  const route = (await scalar(`insert into transfer_routes(event_id, organization_member_id, name) values ('${event}','${owner}','Rosario - Salto') returning id::text`)) as string;
  const otherRoute = (await scalar(`insert into transfer_routes(event_id, organization_member_id, name) values ('${event}','${owner}','Otro') returning id::text`)) as string;

  const stop = (routeId: string, position: number, name: string) =>
    scalar(`insert into transfer_route_stops(route_id, position, name) values ('${routeId}', ${position}, '${name}') returning id::text`) as Promise<string>;
  const stopA = await stop(route, 1, "Rosario");
  const stopB = await stop(route, 2, "Pergamino");
  const stopC = await stop(route, 3, "Salto");
  const foreignStop = await stop(otherRoute, 1, "Ajena");

  await db.exec(`select set_config('request.jwt.claim.sub','${ownerUser}',false)`);
  const assign = async (name: string, stopId: string) =>
    (await db.query<{ manual_code: string }>(`select * from assign_transfer_ticket('${route}', '${name}', null, null, '${stopId}')`)).rows[0].manual_code;

  await assert.rejects(() => assign("Intruso", foreignStop), /parada no pertenece/, "la parada tiene que ser del mismo colectivo");
  const codeA = await assign("Ana", stopA);
  const codeB = await assign("Beto", stopB);
  const codeC = await assign("Cami", stopC);
  const current = () => scalar(`select current_stop_id::text from transfer_routes where id='${route}'`);

  assert.equal(await current(), null, "antes de escanear a alguien el colectivo no tiene posicion");

  // Se escanea primero a quien sube en la ultima parada (por ejemplo llego tarde): la posicion queda en esa.
  const firstScan = await db.query<{ result: string; stop_name: string }>(`select * from validate_transfer_ticket('${route}','${codeC}')`);
  assert.equal(firstScan.rows[0].result, "valid");
  assert.equal(firstScan.rows[0].stop_name, "Salto");
  assert.equal(await current(), stopC);

  // Escanear a alguien de una parada ANTERIOR no hace retroceder al colectivo, pero registra la llegada.
  await db.query(`select * from validate_transfer_ticket('${route}','${codeA}')`);
  assert.equal(await current(), stopC, "la posicion nunca retrocede con un escaneo");
  assert.equal(Number(await scalar(`select count(*)::int from transfer_route_arrivals where route_id='${route}'`)), 2);

  // Marca manual (un pueblo donde no sube nadie, o corregir un error): si puede mover a cualquier parada.
  await db.query(`select * from transfer_mark_stop('${route}', '${stopB}')`);
  assert.equal(await current(), stopB);
  assert.equal(await scalar(`select source from transfer_route_arrivals where route_id='${route}' and stop_id='${stopB}'`), "manual");

  // Otro RRPP que no es dueño no puede marcar paradas.
  await db.exec(`select set_config('request.jwt.claim.sub','${otherUser}',false)`);
  await assert.rejects(() => db.query(`select * from transfer_mark_stop('${route}', '${stopA}')`), /permiso/);
  await db.exec(`select set_config('request.jwt.claim.sub','${ownerUser}',false)`);

  // Reiniciar limpia la posicion y las llegadas.
  await db.query(`select * from transfer_mark_stop('${route}', null)`);
  assert.equal(await current(), null);
  assert.equal(Number(await scalar(`select count(*)::int from transfer_route_arrivals where route_id='${route}'`)), 0);

  // Un pasaje ya usado sigue sin volver a mover nada.
  const again = await db.query<{ result: string }>(`select * from validate_transfer_ticket('${route}','${codeB}')`);
  assert.equal(again.rows[0].result, "valid");
  const reused = await db.query<{ result: string }>(`select * from validate_transfer_ticket('${route}','${codeB}')`);
  assert.equal(reused.rows[0].result, "already_used");
  assert.equal(await current(), stopB);

  await db.close();
});

test("sales agent: los indices de duplicados rechazan instagram/web/telefono/email repetidos, pero no bloquean valores nulos ni prospectos borrados", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  await db.exec(`insert into prospects(name, instagram_username) values ('Uno', 'clubexample')`);
  await assert.rejects(() => db.exec(`insert into prospects(name, instagram_username) values ('Dos', 'clubexample')`), /duplicate key|unique/i);
  // Mayusculas/minusculas distintas siguen siendo el mismo (el indice es sobre lower()).
  await assert.rejects(() => db.exec(`insert into prospects(name, instagram_username) values ('Tres', 'ClubExample')`), /duplicate key|unique/i);
  // Dos prospectos SIN instagram no chocan entre si (el indice es parcial).
  await db.exec(`insert into prospects(name) values ('Sin insta 1'), ('Sin insta 2')`);
  assert.equal(Number(await scalar(`select count(*)::int from prospects where instagram_username is null`)), 2);

  await db.exec(`insert into prospects(name, website_domain) values ('Web A', 'clubexample.com')`);
  await assert.rejects(() => db.exec(`insert into prospects(name, website_domain) values ('Web B', 'clubexample.com')`), /unique/i);

  await db.exec(`insert into prospects(name, phone_digits) values ('Tel A', '5493411234567')`);
  await assert.rejects(() => db.exec(`insert into prospects(name, phone_digits) values ('Tel B', '5493411234567')`), /unique/i);

  // phone_match_key (ultimos 10 digitos): el mismo numero con o sin el "9"
  // de WhatsApp Argentina / codigo de pais tiene que chocar igual, aunque
  // phone_digits (los digitos crudos) sea una cadena distinta.
  await db.exec(`insert into prospects(name, phone_digits, phone_match_key) values ('Cel A', '5493419998888', '3419998888')`);
  await assert.rejects(
    () => db.exec(`insert into prospects(name, phone_digits, phone_match_key) values ('Cel B', '03419998888', '3419998888')`),
    /unique/i,
    "mismos ultimos 10 digitos, prefijo distinto -> se detecta como el mismo telefono"
  );

  // Convertir en cliente: no se puede registrar la conversion dos veces para el mismo prospecto (doble click).
  const conv = await scalar(`insert into prospects(name) values ('Convertido') returning id::text`);
  await db.exec(`insert into prospect_conversions(prospect_id) values ('${conv}')`);
  await assert.rejects(() => db.exec(`insert into prospect_conversions(prospect_id) values ('${conv}')`), /unique/i);

  await db.exec(`insert into prospects(name, email_norm) values ('Mail A', 'hola@club.test')`);
  await assert.rejects(() => db.exec(`insert into prospects(name, email_norm) values ('Mail B', 'hola@club.test')`), /unique/i);

  // Un prospecto borrado (soft-delete) libera su instagram para uno nuevo.
  await db.exec(`update prospects set deleted_at = now() where instagram_username = 'clubexample'`);
  await db.exec(`insert into prospects(name, instagram_username) values ('Reemplazo', 'clubexample')`);
  assert.equal(Number(await scalar(`select count(*)::int from prospects where instagram_username = 'clubexample' and deleted_at is null`)), 1);

  await db.close();
});

test("script de borrado de eventos de prueba: borra el arbol completo de los eventos elegidos y nada mas", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const count = async (table: string, where = "true") => Number(await scalar(`select count(*)::int from ${table} where ${where}`));

  const org = "f1f1f1f1-1111-4111-8111-111111111111";
  const user = "f1f1f1f1-2222-4222-8222-222222222222";
  const evA = "f1f1f1f1-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // se borra
  const evB = "f1f1f1f1-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // se borra
  const evKeep = "f1f1f1f1-cccc-4ccc-8ccc-cccccccccccc"; // se conserva

  await db.exec(`insert into auth.users values ('${user}','purge@example.test',now(),'{}');
    insert into organizations(id,name,slug) values ('${org}','Org Prueba','org-prueba');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${user}','organizer','active');`);
  await db.exec(`alter table events add column if not exists slug text;
    insert into events(id,organization_id,status,slug) values ('${evA}','${org}','active','purga-a'), ('${evB}','${org}','active','purga-b'), ('${evKeep}','${org}','active','conservar');`);

  // La base real tiene claves foraneas entre estas tablas (los stubs de los tests no): se agregan para probar el recorrido.
  await db.exec(`alter table ticket_types add constraint tt_ev_fk foreign key (event_id) references events(id);
    alter table sales add constraint s_ev_fk foreign key (event_id) references events(id);
    alter table sales add constraint s_buyer_fk foreign key (buyer_id) references buyers(id);
    -- Claves foraneas COMPUESTAS (varias columnas), como las de la base real (ej. sale_items -> sales).
    alter table sales add constraint s_id_ev_uq unique (id, event_id);
    alter table sale_items add constraint si_sale_fk foreign key (sale_id, event_id) references sales(id, event_id);
    alter table tickets add constraint t_sale_ev_fk foreign key (sale_id, event_id) references sales(id, event_id);
    alter table sale_items add constraint si_tt_fk foreign key (ticket_type_id) references ticket_types(id);
    alter table tickets add constraint t_sale_fk foreign key (sale_id) references sales(id);
    alter table tickets add constraint t_si_fk foreign key (sale_item_id) references sale_items(id);
    alter table tickets add constraint t_tt_fk foreign key (ticket_type_id) references ticket_types(id);
    alter table entry_scans add constraint es_t_fk foreign key (ticket_id) references tickets(id);`);

  const seedTree = async (event: string, tag: string) => {
    const tt = await scalar(`insert into ticket_types(event_id,name,price_minor,capacity) values ('${event}','General ${tag}',1000,10) returning id::text`);
    const buyer = await scalar(`insert into buyers(organization_id,first_name,last_name,dni) values ('${org}','C','${tag}','${tag}') returning id::text`);
    const sale = await scalar(`insert into sales(organization_id,event_id,buyer_id,total_minor) values ('${org}','${event}','${buyer}',1000) returning id::text`);
    const item = await scalar(`insert into sale_items(sale_id,event_id,ticket_type_id,quantity,unit_price_minor) values ('${sale}','${event}','${tt}',1,1000) returning id::text`);
    const ticket = await scalar(`insert into tickets(sale_item_id,sale_id,event_id,ticket_type_id,manual_code) values ('${item}','${sale}','${event}','${tt}','${tag.toUpperCase()}1') returning id::text`);
    await db.exec(`insert into entry_scans(event_id,ticket_id,result) values ('${event}','${ticket}','valid')`);
    const bar = await scalar(`insert into bars(event_id,name) values ('${event}','Barra ${tag}') returning id::text`);
    const product = await scalar(`insert into products(name,category) values ('Prod ${tag}','bebida') returning id::text`);
    const ep = await scalar(`insert into event_products(event_id,product_id) values ('${event}','${product}') returning id::text`);
    await db.exec(`insert into bar_stock(bar_id,event_product_id,quantity) values ('${bar}','${ep}',5);
      insert into stock_movements(event_id,event_product_id,bar_id,type,quantity) values ('${event}','${ep}','${bar}','ingreso',5)`);
    const table = await scalar(`insert into bar_tables(event_id,name,price_minor) values ('${event}','Mesa ${tag}',100) returning id::text`);
    await db.exec(`insert into bar_sales(event_id,bar_id,bartender_member_id,table_id,event_product_id,quantity,unit_price_minor,total_minor,payment_method)
      values ('${event}','${bar}',(select id from organization_members limit 1),'${table}','${ep}',1,100,100,'efectivo')`);
    const route = await scalar(`insert into transfer_routes(event_id,name) values ('${event}','Ruta ${tag}') returning id::text`);
    const stop = await scalar(`insert into transfer_route_stops(route_id,position,name) values ('${route}',1,'P1') returning id::text`);
    await db.exec(`insert into transfer_tickets(route_id,sale_id,passenger_name,manual_code,stop_id) values ('${route}','${sale}','Pax','${tag.toUpperCase()}X','${stop}')`);
    return { buyer, sale, ticket };
  };

  const a = await seedTree(evA, "aa");
  await seedTree(evB, "bb");
  const keep = await seedTree(evKeep, "kk");
  // Un comprador compartido: compro en un evento a borrar Y en el que se conserva -> tiene que sobrevivir.
  const shared = await scalar(`select buyer_id::text from sales where event_id='${evA}'`);
  await db.exec(`update sales set buyer_id='${shared}' where id='${keep.sale}'`);

  // Se corre el script REAL (con la lista de eventos y el "11" reemplazados por los de esta prueba).
  const script = readFileSync(new URL("../scripts/sql/purgar-eventos-de-prueba.sql", import.meta.url), "utf8");
  const body = script.slice(script.indexOf("\nbegin;\n") + 1);
  const testBody = body
    .replace(/slug in \(\s*'qa-control[\s\S]*?\);/, "slug in ('purga-a','purga-b');")
    .replace("cantidad <> 15", "cantidad <> 2")
    // El script viene en modo ensayo (rollback); para verificar el borrado real se confirma.
    .replace(/\nrollback;\s*$/, "\ncommit;")
    .replace(/\(select count\(\*\) from public\.events where slug like 'qa-%' or slug = 'primavera-2026'\)/, "(select count(*) from public.events where slug like 'purga-%')");
  assert.notEqual(testBody, body, "el reemplazo de la lista tiene que haber funcionado");
  assert.match(body, /\nrollback;\s*$/, "el script viene en modo ensayo: termina en rollback");

  // El ensayo (tal cual viene) no borra NADA.
  await db.exec(body.replace(/slug in \(\s*'qa-control[\s\S]*?\);/, "slug in ('purga-a','purga-b');").replace("cantidad <> 15", "cantidad <> 2"));
  assert.equal(await count("events", `id in ('${evA}','${evB}')`), 2, "el ensayo con rollback no borra los eventos");
  assert.equal(await count("sales"), 3, "ni las ventas");

  await db.exec(testBody);

  // Se fueron los dos eventos y todo su arbol...
  assert.equal(await count("events", `id in ('${evA}','${evB}')`), 0);
  for (const table of ["ticket_types", "sales", "sale_items", "tickets", "entry_scans", "bars", "event_products", "stock_movements", "bar_tables", "bar_sales", "transfer_routes"]) {
    assert.equal(await count(table, `event_id in ('${evA}','${evB}')`), 0, `${table} de los eventos borrados`);
  }
  assert.equal(await count("bar_stock"), 1, "solo queda el stock de la barra del evento conservado");
  assert.equal(await count("transfer_route_stops"), 1);
  assert.equal(await count("transfer_tickets"), 1);

  // ...y el evento que no estaba en la lista quedo completo.
  assert.equal(await count("events", `id='${evKeep}'`), 1);
  for (const table of ["ticket_types", "sales", "sale_items", "tickets", "entry_scans", "bars", "event_products", "stock_movements", "bar_tables", "bar_sales", "transfer_routes"]) {
    assert.equal(await count(table, `event_id='${evKeep}'`), 1, `${table} del evento conservado`);
  }
  assert.equal(await count("tickets", `id='${keep.ticket}'`), 1);

  // La organizacion y sus miembros no se tocan.
  assert.equal(await count("organizations", `id='${org}'`), 1);
  assert.equal(await count("organization_members", `organization_id='${org}'`), 1);

  // Compradores: el de un solo evento borrado se va; el compartido con un evento que se conserva, no.
  assert.equal(await count("buyers", `id='${a.buyer}'`), 1, "el comprador compartido sobrevive porque otra venta lo usa");
  assert.equal(await count("buyers"), 2, "quedan el compartido y el del evento conservado; se fue el del evento borrado 'bb'");

  // Si la lista no coincide con lo esperado, no borra nada (protege contra un error de tipeo).
  await assert.rejects(
    () => db.exec(`begin; create temp table _eventos_a_borrar on commit drop as select id from events where slug = 'no-existe'; do $$ begin if (select count(*) from _eventos_a_borrar) <> 11 then raise exception 'Se esperaban 11'; end if; end $$; commit;`),
    /Se esperaban 11/
  );
  await db.exec("rollback");
  assert.equal(await count("events", `id='${evKeep}'`), 1);

  await db.close();
});

test("mesas online: la mesa se reserva al pagar, se libera si no se paga o se reembolsa y no se vende dos veces", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const admin = "e1e1e1e1-1111-4111-8111-111111111111";
  const org = "e1e1e1e1-2222-4222-8222-222222222222";
  const event = "e1e1e1e1-3333-4333-8333-333333333333";
  const buyer = (n: string) => `'Comprador','${n}','30${n}','3462${n}',null`;

  await db.exec(`insert into auth.users values ('${admin}','admin-mesa@example.test',now(),'{}');
    insert into platform_admins(user_id) values ('${admin}');
    insert into organizations(id,name,slug) values ('${org}','Club Mesas','club-mesas');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${admin}','organizer','active');
    select set_config('request.jwt.claim.sub','${admin}',false);`);

  const mkTable = (name: string, price: string) =>
    scalar(`insert into bar_tables(event_id,name,capacity,price_minor) values ('${event}','${name}',6,${price}) returning id::text`) as Promise<string>;
  const t1 = await mkTable("Mesa 1", "6000");
  const t2 = await mkTable("Mesa 2", "5000");
  const t3 = await mkTable("Mesa 3", "4000");
  const free = await mkTable("Mesa libre", "null");
  const status = async (id: string) => scalar(`select status from bar_tables where id='${id}'`);
  const create = (table: string, n: string) =>
    db.query<{ sale_id: string; total_minor: string; table_name: string }>(`select * from create_online_table_sale('${event}','${table}',${buyer(n)})`);

  // Sin Mercado Pago conectado no se puede vender.
  await assert.rejects(() => create(t1, "111111"), /Mercado Pago/);
  await db.exec(`insert into organization_mercadopago_accounts(organization_id,mp_user_id,access_token,refresh_token,expires_at)
    values ('${org}', 999, 'tok', 'ref', now() + interval '1 day');`);

  // Una mesa sin precio no se vende online.
  await assert.rejects(() => create(free, "222222"), /no se puede reservar online/);

  const s1 = (await create(t1, "333333")).rows[0];
  assert.equal(Number(s1.total_minor), 6000);
  assert.equal(await status(t1), "reserved", "la mesa queda reservada mientras se paga");
  assert.equal(await scalar(`select status from sales where id='${s1.sale_id}'`), "pending_approval");
  await assert.rejects(() => create(t1, "444444"), /ya no esta disponible/, "nadie mas puede tomar la misma mesa");

  // Pago aprobado: la venta se confirma, la mesa sigue reservada, y ahora
  // se emite un ticket propio para la mesa (QR escaneable en la puerta) sin
  // ticket_type_id (no pertenece a ninguna tanda).
  await db.query(`select confirm_online_sale('${s1.sale_id}', 'approved')`);
  assert.equal(await scalar(`select status from sales where id='${s1.sale_id}'`), "confirmed");
  assert.equal(await status(t1), "reserved");
  const t1TicketRow = (await db.query<{ id: string; ticket_type_id: string | null; manual_code: string; status: string }>(
    `select id::text, ticket_type_id, manual_code, status from tickets where sale_id='${s1.sale_id}'`
  )).rows;
  assert.equal(t1TicketRow.length, 1, "la mesa tiene exactamente un ticket");
  assert.equal(t1TicketRow[0].ticket_type_id, null, "no pertenece a ninguna tanda");
  assert.equal(t1TicketRow[0].status, "issued");
  const t1TicketId = t1TicketRow[0].id;

  // Reembolso posterior: se anula la venta, se cancela el ticket de la mesa, y la mesa se libera.
  await db.query(`select confirm_online_sale('${s1.sale_id}', 'refunded')`);
  assert.equal(await scalar(`select status from sales where id='${s1.sale_id}'`), "refunded");
  assert.equal(await status(t1), "available");
  assert.equal(await scalar(`select status from tickets where id='${t1TicketId}'`), "cancelled");

  // Carrito abandonado: el cron de 30 minutos cancela la venta y libera la mesa.
  const s2 = (await create(t2, "555555")).rows[0];
  await db.exec(`update sales set created_at = now() - interval '1 hour' where id='${s2.sale_id}'`);
  assert.equal(Number(await scalar(`select cp_cancel_stale_online_sales()`)), 1);
  assert.equal(await status(t2), "available", "la mesa vuelve a estar disponible");

  // Pago aprobado tarde y la mesa sigue libre: la venta revive y la mesa se vuelve a reservar.
  await db.query(`select confirm_online_sale('${s2.sale_id}', 'approved')`);
  assert.equal(await scalar(`select status from sales where id='${s2.sale_id}'`), "confirmed");
  assert.equal(await status(t2), "reserved");

  // El ticket de la mesa se puede validar en la puerta igual que cualquier
  // entrada (mismo validate_ticket_manual, ticket_types es LEFT JOIN ahora):
  // se identifica por el nombre de la mesa, no por una tanda. El fixture de
  // pglite no simula el default real de manual_code (vive en la base fuera
  // de las migraciones versionadas), asi que se fija a mano como ya hacen
  // otros tests de este archivo (ej. 'VIPCODE2' mas arriba).
  const t2ManualCode = "MESA2CODE";
  await db.exec(`update tickets set manual_code = '${t2ManualCode}' where sale_id='${s2.sale_id}'`);
  const t2Validation = (await db.query<{ result: string; ticket_type: string }>(
    `select result, ticket_type from validate_ticket_manual('${event}', '${t2ManualCode}')`
  )).rows[0];
  assert.equal(t2Validation.result, "valid");
  assert.match(t2Validation.ticket_type, /Mesa 2/, "identifica la mesa, no una tanda");
  const t2SecondScan = (await db.query<{ result: string }>(
    `select result from validate_ticket_manual('${event}', '${t2ManualCode}')`
  )).rows[0];
  assert.equal(t2SecondScan.result, "already_used", "no se puede volver a escanear la misma mesa");

  // Una mesa ya usada no se puede devolver.
  const t2TicketId = await scalar(`select id::text from tickets where sale_id='${s2.sale_id}'`);
  await assert.rejects(
    () => db.query(`select process_ticket_return('${t2TicketId}', 'motivo', 'no_refund')`),
    /ya fue utilizada/
  );

  // Devolver el ticket de una mesa TODAVIA sin usar: usa el total de la
  // venta como precio original (no tiene sale_item_id) y libera la mesa,
  // igual que cancelar la venta completa.
  const t5 = await mkTable("Mesa 5", "4500");
  const s5 = (await create(t5, "999911")).rows[0];
  await db.query(`select confirm_online_sale('${s5.sale_id}', 'approved')`);
  const t5TicketId = await scalar(`select id::text from tickets where sale_id='${s5.sale_id}'`);
  const t5Return = (await db.query<{ refund_amount_minor: string }>(
    `select refund_amount_minor from process_ticket_return('${t5TicketId}', 'no puede venir', 'refunded')`
  )).rows[0];
  assert.equal(Number(t5Return.refund_amount_minor), 4500, "el reintegro sale del total de la venta de la mesa");
  assert.equal(await scalar(`select status from tickets where id='${t5TicketId}'`), "cancelled");
  assert.equal(await status(t5), "available", "devolver el ticket de la mesa la libera");

  // Si el pago no pudo iniciarse, cp_cancel_online_sale cancela la venta pendiente y libera la mesa al instante.
  const t4 = await mkTable("Mesa 4", "3500");
  const sRollback = (await create(t4, "888888")).rows[0];
  assert.equal(await status(t4), "reserved");
  assert.equal(await scalar(`select cp_cancel_online_sale('${sRollback.sale_id}')`), true);
  assert.equal(await scalar(`select status from sales where id='${sRollback.sale_id}'`), "cancelled");
  assert.equal(await status(t4), "available");
  assert.equal(await scalar(`select cp_cancel_online_sale('${sRollback.sale_id}')`), false, "cancelar de nuevo no hace nada");

  // La limpieza de datos de prueba rechaza organizaciones reales (solo 'ZZ QA...').
  await assert.rejects(() => db.query(`select cp_qa_purge_org('${org}')`), /organizaciones de prueba/);

  // Pago aprobado tarde pero otra persona ya tomo la mesa: no se vende dos veces, queda cancelada (reintegro manual).
  const s3 = (await create(t3, "666666")).rows[0];
  await db.exec(`update sales set created_at = now() - interval '1 hour' where id='${s3.sale_id}'`);
  await db.query(`select cp_cancel_stale_online_sales()`);
  const s4 = (await create(t3, "777777")).rows[0];
  await db.query(`select confirm_online_sale('${s3.sale_id}', 'approved')`);
  assert.equal(await scalar(`select status from sales where id='${s3.sale_id}'`), "cancelled", "la mesa ya era de otro comprador");
  assert.equal(await status(t3), "reserved", "la mesa sigue reservada para quien la tomo");
  assert.equal(await scalar(`select status from sales where id='${s4.sale_id}'`), "pending_approval");
  assert.equal(
    await scalar(`select count(*)::int from tickets where sale_id='${s3.sale_id}'`),
    0,
    "una venta cancelada porque la mesa ya era de otro no puede generar un QR valido"
  );

  await db.close();
});

test("confirm_online_sale: rechaza confirmar si el evento se cancelo o la tanda se pauso/desactivo mientras el pago estaba pendiente", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const admin = "c1c1c1c1-1111-4111-8111-111111111111";
  const org = "c1c1c1c1-2222-4222-8222-222222222222";
  const event = "c1c1c1c1-3333-4333-8333-333333333333";
  const ticketTypeA = "c1c1c1c1-4444-4444-8444-444444444444";
  const ticketTypeB = "c1c1c1c1-5555-4555-8555-555555555555";
  const cart = (typeId: string, qty: number) => `'[{"ticket_type_id":"${typeId}","quantity":${qty}}]'::jsonb`;
  const buyer = (n: string) => `'Comprador','${n}','30${n}','3462${n}',null`;

  await db.exec(`insert into auth.users values ('${admin}','admin-cancela@example.test',now(),'{}');
    insert into platform_admins(user_id) values ('${admin}');
    insert into organizations(id,name,slug) values ('${org}','Club Cancela','club-cancela');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into ticket_types(id,event_id,name,price_minor,capacity,active,status)
      values ('${ticketTypeA}','${event}','General A',5000,10,true,'available'),
             ('${ticketTypeB}','${event}','General B',5000,10,true,'available');
    insert into organization_mercadopago_accounts(organization_id,mp_user_id,access_token,refresh_token,expires_at)
      values ('${org}', 888, 'tok', 'ref', now() + interval '1 day');
    select set_config('request.jwt.claim.sub','${admin}',false);`);

  // El evento se cancela DESPUES de armar el carrito, y el pago aprobado
  // (ej. efectivo tipo Pago Facil) llega recien despues -- antes,
  // confirm_online_sale solo revisaba cupo y emitia la entrada igual.
  const saleA = await scalar(`select sale_id::text from create_online_sale('${event}', ${cart(ticketTypeA, 1)}, ${buyer("111111")})`);
  await db.exec(`update events set status='cancelled' where id='${event}'`);
  await db.query(`select confirm_online_sale('${saleA}', 'approved')`);
  assert.equal(await scalar(`select status from sales where id='${saleA}'`), "cancelled", "no confirma una venta de un evento ya cancelado");
  assert.equal(Number(await scalar(`select count(*)::int from tickets where sale_id='${saleA}'`)), 0, "no emite entradas");
  await db.exec(`update events set status='active' where id='${event}'`);

  // La tanda se pausa despues de armar el carrito.
  const saleB = await scalar(`select sale_id::text from create_online_sale('${event}', ${cart(ticketTypeB, 1)}, ${buyer("222222")})`);
  await db.exec(`update ticket_types set status='paused' where id='${ticketTypeB}'`);
  await db.query(`select confirm_online_sale('${saleB}', 'approved')`);
  assert.equal(await scalar(`select status from sales where id='${saleB}'`), "cancelled", "no confirma si la tanda se pauso mientras el pago estaba pendiente");
  assert.equal(Number(await scalar(`select count(*)::int from tickets where sale_id='${saleB}'`)), 0);

  // La tanda se desactiva (active=false) despues de armar el carrito.
  await db.exec(`update ticket_types set status='available', active=true where id='${ticketTypeB}'`);
  const saleC = await scalar(`select sale_id::text from create_online_sale('${event}', ${cart(ticketTypeB, 1)}, ${buyer("333333")})`);
  await db.exec(`update ticket_types set active=false where id='${ticketTypeB}'`);
  await db.query(`select confirm_online_sale('${saleC}', 'approved')`);
  assert.equal(await scalar(`select status from sales where id='${saleC}'`), "cancelled", "no confirma si la tanda se desactivo mientras el pago estaba pendiente");

  // Camino normal (nada cambio mientras tanto): sigue confirmando y emitiendo la entrada.
  await db.exec(`update ticket_types set active=true where id='${ticketTypeB}'`);
  const saleD = await scalar(`select sale_id::text from create_online_sale('${event}', ${cart(ticketTypeA, 1)}, ${buyer("444444")})`);
  await db.query(`select confirm_online_sale('${saleD}', 'approved')`);
  assert.equal(await scalar(`select status from sales where id='${saleD}'`), "confirmed");
  assert.equal(Number(await scalar(`select count(*)::int from tickets where sale_id='${saleD}' and status='issued'`)), 1);

  await db.close();
});

test("ticket_types: el precio no puede quedar negativo (0 si se permite, gratis)", async () => {
  const db = await database();
  const org = "c2c2c2c2-1111-4111-8111-111111111111";
  const event = "c2c2c2c2-2222-4222-8222-222222222222";

  await db.exec(`insert into organizations(id,name,slug) values ('${org}','Club Precio','club-precio');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');`);

  await assert.rejects(
    () => db.exec(`insert into ticket_types(event_id,name,price_minor,capacity) values ('${event}','Precio malo',-100,10)`),
    /ticket_types_price_non_negative|violates check constraint/,
    "un precio negativo debe rechazarse a nivel de base, no solo del lado del cliente"
  );

  // Entrada gratis (0) sigue permitida a proposito.
  await db.exec(`insert into ticket_types(event_id,name,price_minor,capacity) values ('${event}','Gratis',0,10)`);

  await db.close();
});

test("buyers: el email se normaliza a minusculas siempre (para que /mi lo encuentre sin importar como se tipeo al comprar)", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "c3c3c3c3-1111-4111-8111-111111111111";

  await db.exec(`insert into organizations(id,name,slug) values ('${org}','Club Email','club-email')`);

  // Nuevo comprador con email mezclado/con espacios: el trigger lo normaliza al guardar.
  const buyerId = await scalar(
    `insert into buyers(organization_id,first_name,last_name,dni,email) values ('${org}','Juan','Perez','30111222',' Juan.Perez@Gmail.com ') returning id::text`
  );
  assert.equal(await scalar(`select email from buyers where id='${buyerId}'`), "juan.perez@gmail.com");

  // Tambien al editar.
  await db.query(`update buyers set email = 'OTRO@Ejemplo.COM' where id='${buyerId}'`);
  assert.equal(await scalar(`select email from buyers where id='${buyerId}'`), "otro@ejemplo.com");

  // Sin email: sigue null, no revienta con lower(null).
  const noEmailBuyer = await scalar(
    `insert into buyers(organization_id,first_name,last_name,dni) values ('${org}','Sin','Email','30333444') returning id::text`
  );
  assert.equal(await scalar(`select email from buyers where id='${noEmailBuyer}'`), null);

  await db.close();
});

test("create_online_sale/create_online_table_sale: rechazan un evento que ya termino aunque el organizador nunca lo paso a finished", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const admin = "c4c4c4c4-0000-4000-8000-000000000000";
  const org = "c4c4c4c4-1111-4111-8111-111111111111";
  const eventEnded = "c4c4c4c4-2222-4222-8222-222222222222";
  const eventOpen = "c4c4c4c4-3333-4333-8333-333333333333";
  const ticketType = "c4c4c4c4-4444-4444-8444-444444444444";
  const ticketType2 = "c4c4c4c4-5555-4555-8555-555555555555";
  const cart = (typeId: string) => `'[{"ticket_type_id":"${typeId}","quantity":1}]'::jsonb`;
  const buyer = (n: string) => `'Comprador','${n}','30${n}','3462${n}',null`;

  await db.exec(`insert into auth.users values ('${admin}','admin-terminado@example.test',now(),'{}');
    insert into platform_admins(user_id) values ('${admin}');
    select set_config('request.jwt.claim.sub','${admin}',false);
    insert into organizations(id,name,slug,active) values ('${org}','Club Terminado','club-terminado',true);
    insert into organization_mercadopago_accounts(organization_id,mp_user_id,access_token,refresh_token,expires_at)
      values ('${org}', 777, 'tok', 'ref', now() + interval '1 day');
    -- "active" y sin ends_at, pero starts_at de hace 10 horas -- termino hace 4hs (6hs de margen por defecto).
    insert into events(id,organization_id,status,starts_at) values ('${eventEnded}','${org}','active', now() - interval '10 hours');
    insert into events(id,organization_id,status,starts_at) values ('${eventOpen}','${org}','active', now() + interval '2 hours');
    insert into ticket_types(id,event_id,name,price_minor,capacity,active,status) values ('${ticketType}','${eventEnded}','General',5000,10,true,'available');
    insert into ticket_types(id,event_id,name,price_minor,capacity,active,status) values ('${ticketType2}','${eventOpen}','General',5000,10,true,'available');`);

  const table = "c4c4c4c4-6666-4666-8666-666666666666";
  await db.exec(`insert into bar_tables(id,event_id,name,capacity,price_minor) values ('${table}','${eventEnded}','Mesa 1',6,10000);`);

  await assert.rejects(
    () => db.query(`select * from create_online_sale('${eventEnded}', ${cart(ticketType)}, ${buyer("111111")})`),
    /ya finalizo/,
    "no debe dejar comprar entradas de un evento que ya termino aunque el status siga en active"
  );
  await assert.rejects(
    () => db.query(`select * from create_online_table_sale('${eventEnded}','${table}', ${buyer("222222")})`),
    /ya finalizo/,
    "misma proteccion para reservar una mesa"
  );

  // El evento que todavia no termino sigue funcionando normal.
  const okSale = await scalar(`select sale_id::text from create_online_sale('${eventOpen}', ${cart(ticketType2)}, ${buyer("333333")})`);
  assert.ok(okSale, "un evento que todavia no termino sigue permitiendo comprar");

  await db.close();
});

test("pedidos completos: stock al entregar, venta de mesa, nivel con descuento y puntos dobles", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "d1d1d1d1-1111-4111-8111-111111111111";
  const event = "d1d1d1d1-2222-4222-8222-222222222222";

  await db.exec(`insert into organizations(id,name,slug) values ('${org}','Club Completo','club-completo');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');`);

  const product = await scalar(`insert into products(name, category) values ('Fernet Test','bebida') returning id::text`);
  const ep = await scalar(`insert into event_products(event_id, product_id) values ('${event}','${product}') returning id::text`);
  const bar = await scalar(`insert into bars(event_id, name) values ('${event}','Barra 1') returning id::text`);
  await db.exec(`insert into bar_stock(bar_id, event_product_id, quantity) values ('${bar}','${ep}', 10)`);
  const stock = async () => Number(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${ep}'`));

  const member = await scalar(`insert into premium_members(organization_id, first_name, last_name, member_code, balance_minor, phone, email) values ('${org}','Ana','Completa','CP0001', 100000, '3400000001', 'ana@example.test') returning id::text`);
  const fernet = await scalar(`insert into member_menu_items(organization_id, kind, name, price_minor, points_earned, product_id, stock_units) values ('${org}','trago','Fernet',2000,10,'${product}',1) returning id::text`);
  const combo = await scalar(`insert into member_menu_items(organization_id, kind, name, price_minor, points_earned, product_id, stock_units) values ('${org}','combo','Combo',5000,30,'${product}',3) returning id::text`);
  await db.exec(`insert into member_levels(organization_id, name, min_points, discount_percent, perk) values ('${org}','Plata',100,10,'10% de descuento'), ('${org}','Oro',500,20,null)`);

  const place = async (items: string, payment = "en_barra") =>
    (await db.query<{ order_id: string; total_minor: string }>(`select * from member_place_order('${member}','consumo','${items}'::jsonb,'${payment}',null,null,null)`)).rows[0];
  const deliver = (id: string) => db.query(`select * from member_order_set_status('${id}','delivered','${org}',null)`);

  // Sin nivel todavia: precio completo, y al entregar baja el stock del producto vinculado.
  const o1 = await place(`[{"id":"${fernet}","qty":2}]`);
  assert.equal(Number(o1.total_minor), 4000);
  assert.equal(await scalar(`select event_id::text from member_orders where id='${o1.order_id}'`), event, "con un solo evento activo el pedido queda vinculado a el desde que se crea");
  await deliver(o1.order_id);
  assert.equal(await stock(), 8, "entregar 2 fernet descuenta 2 del stock");
  assert.equal(await scalar(`select stock_deducted from member_orders where id='${o1.order_id}'`), true);
  assert.equal(Number(await scalar(`select count(*)::int from stock_movements where event_product_id='${ep}' and type='venta'`)), 1);

  // Con 100 puntos ganados pasa a Plata: 10% de descuento automatico.
  const info = (await scalar(`select member_level_info('${member}')`)) as { lifetime: number; level: { name: string } | null; next: { name: string; missing: number } | null };
  assert.equal(info.lifetime, 20);
  assert.equal(info.level, null);
  assert.deepEqual([info.next?.name, info.next?.missing], ["Plata", 80]);
  await db.exec(`insert into member_points_transactions(member_id, delta, reason) values ('${member}', 80, 'Pedido extra')`);
  const o2 = await place(`[{"id":"${combo}","qty":1}]`);
  assert.equal(Number(o2.total_minor), 4500, "combo de 5000 con 10% de descuento");
  await deliver(o2.order_id);
  assert.equal(await stock(), 5, "el combo usa 3 unidades de stock");

  // Puntos dobles vigentes: el pedido suma el doble.
  await db.exec(`insert into member_point_boosts(organization_id, name, multiplier, starts_at, ends_at) values ('${org}','Doble sabado',2, now() - interval '1 hour', now() + interval '1 hour')`);
  const o3 = await place(`[{"id":"${fernet}","qty":1}]`);
  assert.equal(Number(await scalar(`select points_earned from member_orders where id='${o3.order_id}'`)), 20, "10 puntos x2");
  assert.equal(Number(await scalar(`select boost_multiplier from member_orders where id='${o3.order_id}'`)), 2);
  await deliver(o3.order_id);
  assert.equal(await stock(), 4);

  // Un boost vencido no cuenta.
  await db.exec(`update member_point_boosts set starts_at = now() - interval '3 hours', ends_at = now() - interval '2 hours'`);
  const o4 = await place(`[{"id":"${fernet}","qty":1}]`);
  assert.equal(Number(await scalar(`select points_earned from member_orders where id='${o4.order_id}'`)), 10);

  // Stock insuficiente: entregar tiene que fallar, no entregar igual en
  // silencio (antes descontaba lo que habia y quedaba "entregado").
  const o5 = await place(`[{"id":"${combo}","qty":5}]`);
  await assert.rejects(() => deliver(o5.order_id), /No hay stock suficiente/, "no se puede entregar si no alcanza el stock");
  assert.equal(await stock(), 4, "un intento de entrega fallido no toca el stock");
  assert.equal(await scalar(`select status from member_orders where id='${o5.order_id}'`), "pending", "el pedido queda pendiente, no entregado");

  // Dos eventos activos AL CREAR el pedido: no se sabe de cual barra va a
  // salir, asi que el pedido no queda vinculado a ningun evento y por lo
  // tanto no se toca el stock al entregar (antes se re-adivinaba el evento
  // recien al entregar, lo que ademas era inconsistente si la cantidad de
  // eventos activos cambiaba entre crear y entregar el pedido).
  await db.exec(`insert into events(id,organization_id,status) values ('d1d1d1d1-9999-4999-8999-999999999999','${org}','active')`);
  const o6 = await place(`[{"id":"${fernet}","qty":1}]`);
  assert.equal(await scalar(`select event_id from member_orders where id='${o6.order_id}'`), null, "con 2 eventos activos el pedido no queda vinculado a ninguno");
  await deliver(o6.order_id);
  assert.equal(await stock(), 4, "sin evento vinculado no se toca el stock");
  assert.equal(await scalar(`select stock_deducted from member_orders where id='${o6.order_id}'`), false);
  await db.exec(`delete from events where id='d1d1d1d1-9999-4999-8999-999999999999'`);

  // Mesa pagada con saldo: genera una venta del evento; cancelar la anula.
  const table = await scalar(`insert into bar_tables(event_id,name,capacity,price_minor) values ('${event}','Mesa 9',6,4000) returning id::text`);
  const m1 = await db.query<{ order_id: string }>(`select * from member_place_order('${member}','mesa','[]'::jsonb,'wallet','${table}',null,null)`);
  assert.equal(Number(await scalar(`select count(*)::int from sales where event_id='${event}' and channel='mesa' and status='confirmed'`)), 1);
  assert.equal(Number(await scalar(`select total_minor from sales where event_id='${event}' and channel='mesa'`)), 4000);
  await db.query(`select * from member_order_set_status('${m1.rows[0].order_id}','cancelled','${org}',null)`);
  assert.equal(await scalar(`select status::text from sales where event_id='${event}' and channel='mesa'`), "cancelled");

  // Mesa a pagar en el boliche: la venta se registra recien al confirmarla (entregada).
  const m2 = await db.query<{ order_id: string }>(`select * from member_place_order('${member}','mesa','[]'::jsonb,'en_barra','${table}',null,null)`);
  assert.equal(Number(await scalar(`select count(*)::int from sales where event_id='${event}' and channel='mesa' and status='confirmed'`)), 0);
  await deliver(m2.rows[0].order_id);
  assert.equal(Number(await scalar(`select count(*)::int from sales where event_id='${event}' and channel='mesa' and status='confirmed'`)), 1);

  await db.close();
});

test("pedidos de socio: un pedido de barra colgado vence solo; una reserva de mesa solo vence cuando el evento ya paso, y una mesa pagada con saldo nunca", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "d2d2d2d2-1111-4111-8111-111111111111";
  const futureEvent = "d2d2d2d2-2222-4222-8222-222222222222";
  const pastEvent = "d2d2d2d2-3333-4333-8333-333333333333";

  await db.exec(`insert into organizations(id,name,slug) values ('${org}','Club Vencidos','club-vencidos');
    insert into events(id,organization_id,status,starts_at) values ('${futureEvent}','${org}','upcoming', now() + interval '3 days');
    insert into events(id,organization_id,status,starts_at,ends_at) values ('${pastEvent}','${org}','active', now() - interval '20 hours', now() - interval '2 hours');`);

  const member = await scalar(`insert into premium_members(organization_id, first_name, last_name, member_code, balance_minor) values ('${org}','Beto','Colgado','CV0001', 50000) returning id::text`);
  const fernet = await scalar(`insert into member_menu_items(organization_id, kind, name, price_minor) values ('${org}','trago','Fernet',3000) returning id::text`);
  const paidTable = await scalar(`insert into bar_tables(event_id,name,capacity,price_minor) values ('${futureEvent}','Mesa paga',4,4000) returning id::text`);
  const laterTable = await scalar(`insert into bar_tables(event_id,name,capacity,price_minor) values ('${futureEvent}','Mesa sabado',4,4000) returning id::text`);
  const pastTable = await scalar(`insert into bar_tables(event_id,name,capacity,price_minor) values ('${pastEvent}','Mesa vieja',4,4000) returning id::text`);

  const paid = await db.query<{ order_id: string }>(`select * from member_place_order('${member}','mesa','[]'::jsonb,'wallet','${paidTable}',null,null)`);
  const later = await db.query<{ order_id: string }>(`select * from member_place_order('${member}','mesa','[]'::jsonb,'en_barra','${laterTable}',null,null)`);
  const past = await db.query<{ order_id: string }>(`select * from member_place_order('${member}','mesa','[]'::jsonb,'en_barra','${pastTable}',null,null)`);
  const drink = await db.query<{ order_id: string }>(`select * from member_place_order('${member}','consumo','[{"id":"${fernet}","qty":1}]'::jsonb,'wallet',null,null,null)`);
  const freshDrink = await db.query<{ order_id: string }>(`select * from member_place_order('${member}','consumo','[{"id":"${fernet}","qty":1}]'::jsonb,'wallet',null,null,null)`);
  assert.equal(Number(await scalar(`select balance_minor from premium_members where id='${member}'`)), 40000, "mesa paga 4000 + dos tragos 3000");

  // Todo se pidio hace 10 horas, salvo el trago fresco.
  await db.exec(`update member_orders set created_at = now() - interval '10 hours' where id in ('${paid.rows[0].order_id}','${later.rows[0].order_id}','${past.rows[0].order_id}','${drink.rows[0].order_id}')`);

  const cancelled = Number(await scalar(`select cp_expire_stale_member_orders(6)`));
  assert.equal(cancelled, 2, "solo el trago colgado y la mesa de un evento que ya paso");

  assert.equal(await scalar(`select status from member_orders where id='${drink.rows[0].order_id}'`), "cancelled", "pedido de barra colgado: se cancela");
  assert.equal(await scalar(`select status from member_orders where id='${freshDrink.rows[0].order_id}'`), "pending", "pedido de barra reciente: no se toca");
  assert.equal(await scalar(`select status from member_orders where id='${past.rows[0].order_id}'`), "cancelled");
  assert.equal(await scalar(`select status from bar_tables where id='${pastTable}'`), "available");
  assert.equal(await scalar(`select status from member_orders where id='${later.rows[0].order_id}'`), "pending", "reserva para un evento de otro dia: sigue reservada (antes se cancelaba a las 6 horas)");
  assert.equal(await scalar(`select status from bar_tables where id='${laterTable}'`), "reserved");
  assert.equal(await scalar(`select status from member_orders where id='${paid.rows[0].order_id}'`), "pending", "mesa pagada con saldo: nunca se cancela sola");
  assert.equal(await scalar(`select status from bar_tables where id='${paidTable}'`), "reserved");
  assert.equal(Number(await scalar(`select balance_minor from premium_members where id='${member}'`)), 43000, "solo se reembolsa el trago cancelado");

  // Correrlo de nuevo no encuentra nada mas para cancelar.
  assert.equal(Number(await scalar(`select cp_expire_stale_member_orders(6)`)), 0);

  await db.close();
});

test("avisos: el colectivo avisa a quien todavia no subio, sin duplicar, y el reinicio vuelve a avisar", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "c1c1c1c1-1111-4111-8111-111111111111";
  const event = "c1c1c1c1-2222-4222-8222-222222222222";
  const ownerUser = "c1c1c1c1-3333-4333-8333-333333333333";

  await db.exec(`insert into auth.users values ('${ownerUser}','owner-aviso@example.test',now(),'{}');
    insert into organizations(id,name,slug) values ('${org}','Club Avisos','club-avisos');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${ownerUser}','rrpp','active');`);
  const owner = await scalar(`select id::text from organization_members where user_id='${ownerUser}'`);
  const route = (await scalar(`insert into transfer_routes(event_id, organization_member_id, name) values ('${event}','${owner}','Ruta avisos') returning id::text`)) as string;
  const stop = async (position: number, name: string) =>
    (await scalar(`insert into transfer_route_stops(route_id, position, name) values ('${route}', ${position}, '${name}') returning id::text`)) as string;
  const stopA = await stop(1, "Rosario");
  const stopB = await stop(2, "Pergamino");
  const stopC = await stop(3, "Salto");

  const ticket = async (name: string, stopId: string, status = "issued") =>
    (await scalar(`insert into transfer_tickets(route_id, passenger_name, manual_code, stop_id, status) values ('${route}','${name}','${name.slice(0, 3).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}','${stopId}','${status}') returning id::text`)) as string;
  const pA = await ticket("Ana", stopA);
  const pB = await ticket("Beto", stopB);
  const pC = await ticket("Cami", stopC);
  await ticket("Cancelado", stopA, "cancelled");

  const claim = async () =>
    (await db.query<{ ticket_id: string; kind: string; stop_name: string; current_stop_name: string }>(`select * from transfer_claim_notifications('${route}')`)).rows;
  const setCurrent = (stopId: string) => db.exec(`update transfer_routes set current_stop_id='${stopId}', current_stop_at=now() where id='${route}'`);

  assert.equal((await claim()).length, 0, "sin posicion del colectivo no hay avisos");

  // El colectivo esta en la 1: Ana esta en su parada (arrived), Beto es el siguiente (approaching), Cami todavia no.
  await setCurrent(stopA);
  const first = await claim();
  const byTicket = (rows: typeof first) => Object.fromEntries(rows.map((r) => [r.ticket_id, r.kind]));
  assert.deepEqual(byTicket(first), { [pA]: "arrived", [pB]: "approaching" });
  assert.equal(first.find((r) => r.ticket_id === pB)?.current_stop_name, "Rosario");
  assert.equal(first.find((r) => r.ticket_id === pB)?.stop_name, "Pergamino");
  assert.equal((await claim()).length, 0, "reclamar de nuevo no duplica los avisos");

  // Avanza a la 2: Beto llego, Cami es la siguiente. Ana (que no subio) ya quedo atras y no recibe nada nuevo.
  await setCurrent(stopB);
  assert.deepEqual(byTicket(await claim()), { [pB]: "arrived", [pC]: "approaching" });

  // Quien ya subio (used) no recibe avisos.
  await db.exec(`update transfer_tickets set status='used' where id='${pC}'`);
  await setCurrent(stopC);
  assert.equal((await claim()).length, 0);

  // Reiniciar el recorrido borra los avisos: un recorrido nuevo vuelve a avisar.
  await db.exec(`select set_config('request.jwt.claim.sub','${ownerUser}',false)`);
  await db.query(`select * from transfer_mark_stop('${route}', null)`);
  assert.equal(Number(await scalar(`select count(*)::int from transfer_notifications`)), 0);
  await setCurrent(stopA);
  assert.deepEqual(byTicket(await claim()), { [pA]: "arrived", [pB]: "approaching" });

  await db.close();
});

test("avisos: suscripcion push unica por dispositivo y aviso de premio que se reclama una sola vez", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "c2c2c2c2-1111-4111-8111-111111111111";
  await db.exec(`insert into organizations(id,name,slug) values ('${org}','Club Push','club-push')`);
  const mk = (code: string) => scalar(`insert into premium_members(organization_id, first_name, last_name, member_code) values ('${org}','S','${code}','${code}') returning id::text`) as Promise<string>;
  const ana = await mk("PS0001");
  const beto = await mk("PS0002");

  // Un mismo celular (endpoint) pasa de un socio a otro, no queda duplicado.
  const upsert = (member: string) =>
    db.exec(`insert into member_push_subscriptions(member_id, endpoint, p256dh, auth_key) values ('${member}','https://push.example.test/abc123','k','a')
      on conflict (endpoint) do update set member_id = excluded.member_id`);
  await upsert(ana);
  await upsert(beto);
  assert.equal(Number(await scalar(`select count(*)::int from member_push_subscriptions`)), 1);
  assert.equal(await scalar(`select member_id::text from member_push_subscriptions`), beto);

  // Borrar al socio borra sus suscripciones.
  await db.exec(`delete from premium_members where id='${beto}'`);
  assert.equal(Number(await scalar(`select count(*)::int from member_push_subscriptions`)), 0);

  // El aviso del premio se reclama una sola vez.
  await db.exec(`insert into member_monthly_winners(organization_id, member_id, period, position, points, prize) values ('${org}','${ana}','2026-08',1,100,'Mesa VIP')`);
  const claim = () => db.query(`update member_monthly_winners set notified_at = now() where period='2026-08' and notified_at is null returning id`);
  assert.equal((await claim()).rows.length, 1);
  assert.equal((await claim()).rows.length, 0, "el segundo intento no vuelve a avisar");

  await db.close();
});

test("membresia premium: codigo de socio unico por organizacion, no entre organizaciones distintas", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const orgA = "bbbbbbbb-1111-4111-8111-111111111111";
  const orgB = "bbbbbbbb-2222-4222-8222-222222222222";

  await db.exec(`insert into organizations(id,name,slug) values ('${orgA}','Club A','club-a'), ('${orgB}','Club B','club-b');
    update organizations set premium_memberships_enabled = true where id in ('${orgA}','${orgB}');`);
  assert.equal(await scalar(`select premium_memberships_enabled from organizations where id='${orgA}'`), true);

  await db.exec(`insert into premium_members(organization_id, first_name, last_name, member_code) values ('${orgA}','Juan','Perez','ABC123')`);

  await assert.rejects(
    () => db.query(`insert into premium_members(organization_id, first_name, last_name, member_code) values ('${orgA}','Otro','Socio','ABC123')`),
    /duplicate key value violates unique constraint/,
    "el mismo codigo no se puede repetir dentro de la misma organizacion"
  );

  // El mismo codigo SI es valido en otra organizacion distinta.
  await db.exec(`insert into premium_members(organization_id, first_name, last_name, member_code) values ('${orgB}','Maria','Lopez','ABC123')`);
  assert.equal(await scalar(`select count(*)::int from premium_members where member_code='ABC123'`), 2);

  await db.close();
});

test("lista negra: check_blacklist normaliza el DNI, respeta permisos y el flag active", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  const org = "cccccccc-1111-4111-8111-111111111111";
  const event = "cccccccc-2222-4222-8222-222222222222";
  const controllerUser = "cccccccc-3333-4333-8333-333333333333";
  const outsiderUser = "cccccccc-4444-4444-8444-444444444444";

  await db.exec(`insert into auth.users values ('${controllerUser}','controller-bn@example.test',now(),'{}'), ('${outsiderUser}','outsider-bn@example.test',now(),'{}');
    insert into organizations(id,name,slug) values ('${org}','Club Lista Negra','club-lista-negra');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${controllerUser}','controller','active');`);

  const controllerMemberId = await scalar(`select id::text from organization_members where user_id='${controllerUser}'`);
  await db.exec(`insert into event_staff(event_id,organization_member_id,staff_role,active) values ('${event}','${controllerMemberId}','controller',true);
    insert into blacklist_entries(organization_id, dni, full_name, reason, active) values ('${org}', '40.123.456', 'Juan Restringido', 'Pelea en la puerta', true);
    insert into blacklist_entries(organization_id, dni, full_name, active) values ('${org}', '40999999', 'Inactivo', false);`);

  await db.exec(`select set_config('request.jwt.claim.sub','${controllerUser}',false)`);

  // El DNI con puntos/espacios matchea igual que el guardado con puntos.
  const matchDots = await db.query<{ is_blacklisted: boolean; reason: string }>(`select * from check_blacklist('${event}','40123456')`);
  assert.equal(matchDots.rows[0].is_blacklisted, true);
  assert.equal(matchDots.rows[0].reason, "Pelea en la puerta");

  const matchSpaces = await db.query<{ is_blacklisted: boolean }>(`select * from check_blacklist('${event}','40 123 456')`);
  assert.equal(matchSpaces.rows[0].is_blacklisted, true, "compara solo digitos, sin importar el formato");

  // Una entrada inactiva no bloquea.
  const inactive = await db.query<{ is_blacklisted: boolean }>(`select * from check_blacklist('${event}','40999999')`);
  assert.equal(inactive.rows[0].is_blacklisted, false, "una entrada desactivada no cuenta");

  // DNI que no esta en la lista.
  const clean = await db.query<{ is_blacklisted: boolean }>(`select * from check_blacklist('${event}','11222333')`);
  assert.equal(clean.rows[0].is_blacklisted, false);

  // Un usuario sin ningun rol en el evento no puede ni consultar la lista.
  await db.exec(`select set_config('request.jwt.claim.sub','${outsiderUser}',false)`);
  await assert.rejects(
    () => db.query(`select * from check_blacklist('${event}','40123456')`),
    /permiso/,
    "alguien sin rol de control en el evento no puede consultar la lista negra"
  );

  await db.close();
});

test("billetera del socio: wallet_move mantiene el saldo sincronizado con el ledger, no deja quedar negativo y respeta permisos", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  const org = "dddddddd-1111-4111-8111-111111111111";
  const organizerUser = "dddddddd-2222-4222-8222-222222222222";
  const outsiderUser = "dddddddd-3333-4333-8333-333333333333";

  await db.exec(`insert into auth.users values ('${organizerUser}','organizer-wallet@example.test',now(),'{}'), ('${outsiderUser}','outsider-wallet@example.test',now(),'{}');
    insert into organizations(id,name,slug) values ('${org}','Club Wallet','club-wallet');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${organizerUser}','organizer','active');`);

  const member = await scalar(
    `insert into premium_members(organization_id, first_name, last_name, member_code) values ('${org}','Ana','Socia','ZZZ999') returning id::text`
  );

  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false)`);

  const topup = await db.query<{ new_balance_minor: string }>(`select * from wallet_move('${member}', 10000, 'topup', 'Carga en puerta')`);
  assert.equal(Number(topup.rows[0].new_balance_minor), 10000);
  assert.equal(Number(await scalar(`select balance_minor from premium_members where id='${member}'`)), 10000, "balance_minor queda sincronizado con el movimiento");

  const spend = await db.query<{ new_balance_minor: string }>(`select * from wallet_move('${member}', -3000, 'spend', 'Consumo barra')`);
  assert.equal(Number(spend.rows[0].new_balance_minor), 7000);

  assert.equal(
    Number(await scalar(`select sum(amount_minor)::text from wallet_transactions where member_id='${member}'`)),
    7000,
    "balance_minor siempre es igual a la suma de wallet_transactions"
  );

  // No deja quedar en negativo.
  await assert.rejects(
    () => db.query(`select * from wallet_move('${member}', -999999, 'spend', null)`),
    /insuficiente/,
    "no permite gastar mas de lo que tiene cargado"
  );
  assert.equal(Number(await scalar(`select balance_minor from premium_members where id='${member}'`)), 7000, "el intento rechazado no toco el balance");

  // Alguien sin rol de organizador en esa organizacion no puede tocar la billetera.
  await db.exec(`select set_config('request.jwt.claim.sub','${outsiderUser}',false)`);
  await assert.rejects(
    () => db.query(`select * from wallet_move('${member}', 5000, 'topup', null)`),
    /permiso/,
    "un usuario sin rol de organizador en la organizacion del socio no puede mover su saldo"
  );

  await db.close();
});

test("idempotencia de pagos y gastos: la misma key no puede insertarse 2 veces", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  const quote = await db.query<{ id: string }>(`insert into quotes(client_name, status) values ('Cliente Idem', 'a_pagar') returning id`);
  const quoteId = quote.rows[0].id;
  const key = "eeeeeeee-1111-4111-8111-111111111111";

  await db.exec(`insert into quote_payments(quote_id, amount_minor, idempotency_key) values ('${quoteId}', 10000, '${key}')`);
  await assert.rejects(
    () => db.query(`insert into quote_payments(quote_id, amount_minor, idempotency_key) values ('${quoteId}', 10000, '${key}')`),
    /duplicate key value violates unique constraint/,
    "un reintento con la misma key no duplica el pago"
  );
  // Sin key (null), no hay restriccion -- varios pagos legitimos sin key conviven bien.
  await db.exec(`insert into quote_payments(quote_id, amount_minor) values ('${quoteId}', 5000), ('${quoteId}', 5000)`);
  assert.equal(await scalar(`select count(*)::int from quote_payments where quote_id='${quoteId}'`), 3);

  const expenseKey = "eeeeeeee-2222-4222-8222-222222222222";
  await db.exec(`insert into expenses(description, amount_minor, idempotency_key) values ('Gasto idem', 2000, '${expenseKey}')`);
  await assert.rejects(
    () => db.query(`insert into expenses(description, amount_minor, idempotency_key) values ('Gasto idem', 2000, '${expenseKey}')`),
    /duplicate key value violates unique constraint/
  );

  await db.close();
});

test("payment_reminders_log: un mismo dia solo se puede reclamar una vez (evita el spam del recordatorio de cobros)", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  await db.exec(`insert into payment_reminders_log(sent_date) values ('2026-03-01')`);
  assert.equal(await scalar(`select count(*)::int from payment_reminders_log where sent_date='2026-03-01'`), 1);

  await assert.rejects(
    () => db.query(`insert into payment_reminders_log(sent_date) values ('2026-03-01')`),
    /duplicate key value violates unique constraint/,
    "una segunda corrida del cron el mismo dia no puede reclamar el aviso de nuevo"
  );

  await db.exec(`insert into payment_reminders_log(sent_date) values ('2026-03-02')`);
  assert.equal(await scalar(`select count(*)::int from payment_reminders_log`), 2, "un dia distinto si puede reclamarse");

  await db.close();
});

test("metas: un mes solo puede tener una meta (upsert por period)", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  await db.exec(`insert into finance_goals(period, goal_minor) values ('2026-04-01', 1000000)`);
  assert.equal(await scalar(`select goal_minor::text from finance_goals where period='2026-04-01'`), "1000000");

  await assert.rejects(
    () => db.query(`insert into finance_goals(period, goal_minor) values ('2026-04-01', 500000)`),
    /duplicate key value violates unique constraint/,
    "un segundo insert para el mismo mes choca con el unique -- el API hace upsert (onConflict: period) en vez de insert plano"
  );

  await db.exec(`update finance_goals set goal_minor = 1500000 where period='2026-04-01'`);
  assert.equal(await scalar(`select goal_minor::text from finance_goals where period='2026-04-01'`), "1500000");

  await assert.rejects(
    () => db.query(`insert into finance_goals(period, goal_minor) values ('2026-05-01', 0)`),
    /violates check constraint/,
    "la meta tiene que ser positiva"
  );

  await db.close();
});

test("soft-delete: un socio, entrada de lista negra y colectivo borrados dejan de funcionar en los RPCs", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "abababab-1111-4111-8111-111111111111";
  const event = "abababab-2222-4222-8222-222222222222";
  const organizerUser = "abababab-3333-4333-8333-333333333333";

  await db.exec(`insert into auth.users values ('${organizerUser}','sd-organizer@example.test',now(),'{}');
    insert into organizations(id,name,slug) values ('${org}','Club SD','club-sd');
    insert into events(id,organization_id,status) values ('${event}','${org}','active');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${organizerUser}','organizer','active');`);

  const member = await scalar(`insert into premium_members(organization_id, first_name, last_name, member_code) values ('${org}','Ana','Borrada','SDSD11') returning id::text`);
  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false)`);
  await db.query(`select * from wallet_move('${member}', 5000, 'topup', null)`);

  // Soft-delete: el RPC ya no lo encuentra ni deja mover saldo.
  await db.exec(`update premium_members set deleted_at = now() where id='${member}'`);
  await assert.rejects(() => db.query(`select * from wallet_move('${member}', 1000, 'topup', null)`), /no existe/);

  // Restaurado, vuelve a funcionar.
  await db.exec(`update premium_members set deleted_at = null where id='${member}'`);
  await db.query(`select * from wallet_move('${member}', 1000, 'topup', null)`);

  // Lista negra borrada no advierte (lo consulta un controlador asignado).
  const controllerUser = "abababab-4444-4444-8444-444444444444";
  await db.exec(`insert into auth.users values ('${controllerUser}','sd-controller@example.test',now(),'{}');
    insert into organization_members(organization_id,user_id,role,status) values ('${org}','${controllerUser}','controller','active');`);
  const controllerMember = await scalar(`select id::text from organization_members where user_id='${controllerUser}'`);
  await db.exec(`insert into event_staff(event_id,organization_member_id,staff_role,active) values ('${event}','${controllerMember}','controller',true);
    insert into blacklist_entries(organization_id, dni, active, deleted_at) values ('${org}', '30111222', true, now());
    select set_config('request.jwt.claim.sub','${controllerUser}',false);`);
  const bl = await db.query<{ is_blacklisted: boolean }>(`select * from check_blacklist('${event}','30111222')`);
  assert.equal(bl.rows[0].is_blacklisted, false, "una entrada borrada no genera advertencia en la puerta");

  // Indice unico parcial: un socio borrado libera su codigo.
  await db.exec(`update premium_members set deleted_at = now() where id='${member}'`);
  await db.exec(`insert into premium_members(organization_id, first_name, last_name, member_code) values ('${org}','Otra','Persona','SDSD11')`);

  await db.close();
});

test("app del socio: pedidos con saldo y puntos, cancelacion con reembolso, mesas e idempotencia", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "acacacac-1111-4111-8111-111111111111";
  const otherOrg = "acacacac-2222-4222-8222-222222222222";
  const event = "acacacac-3333-4333-8333-333333333333";

  await db.exec(`insert into organizations(id,name,slug) values ('${org}','Club App','club-app'), ('${otherOrg}','Otro Club','otro-club');
    insert into events(id,organization_id,status) values ('${event}','${org}','upcoming');`);

  const member = await scalar(`insert into premium_members(organization_id, first_name, last_name, member_code, balance_minor) values ('${org}','Ana','App','APP111', 10000) returning id::text`);
  const fernet = await scalar(`insert into member_menu_items(organization_id, kind, name, price_minor, points_earned) values ('${org}','trago','Fernet',3000,10) returning id::text`);
  const premio = await scalar(`insert into member_menu_items(organization_id, kind, name, points_cost) values ('${org}','premio','Trago gratis',15) returning id::text`);
  const foreign = await scalar(`insert into member_menu_items(organization_id, kind, name, price_minor) values ('${otherOrg}','trago','Ajeno',100) returning id::text`);

  // Pedido pagado con saldo: descuenta de la billetera, todavia no da puntos.
  const placed = await db.query<{ order_id: string; total_minor: string; balance_minor: string }>(
    `select * from member_place_order('${member}', 'consumo', '[{"id":"${fernet}","qty":2}]'::jsonb, 'wallet', null, null, 'key-1')`
  );
  const orderId = placed.rows[0].order_id;
  assert.equal(Number(placed.rows[0].total_minor), 6000);
  assert.equal(Number(placed.rows[0].balance_minor), 4000);
  assert.equal(Number(await scalar(`select balance_minor from premium_members where id='${member}'`)), 4000);
  assert.equal(Number(await scalar(`select points_balance from premium_members where id='${member}'`)), 0, "los puntos se suman al entregar, no al pedir");

  // Reintento con la misma key: no duplica ni vuelve a cobrar.
  const again = await db.query<{ order_id: string; already_existed: boolean }>(
    `select * from member_place_order('${member}', 'consumo', '[{"id":"${fernet}","qty":2}]'::jsonb, 'wallet', null, null, 'key-1')`
  );
  assert.equal(again.rows[0].order_id, orderId);
  assert.equal(again.rows[0].already_existed, true);
  assert.equal(await scalar(`select count(*)::int from member_orders where member_id='${member}'`), 1);
  assert.equal(Number(await scalar(`select balance_minor from premium_members where id='${member}'`)), 4000);

  // Saldo insuficiente y producto de otra organizacion se rechazan.
  await assert.rejects(() => db.query(`select * from member_place_order('${member}', 'consumo', '[{"id":"${fernet}","qty":5}]'::jsonb, 'wallet', null, null, null)`), /Saldo insuficiente/);
  await assert.rejects(() => db.query(`select * from member_place_order('${member}', 'consumo', '[{"id":"${foreign}","qty":1}]'::jsonb, 'en_barra', null, null, null)`), /ya no esta disponible/);

  // Entregar suma los puntos una sola vez.
  await db.query(`select * from member_order_set_status('${orderId}', 'delivered', '${org}', null)`);
  assert.equal(Number(await scalar(`select points_balance from premium_members where id='${member}'`)), 20);
  await assert.rejects(() => db.query(`select * from member_order_set_status('${orderId}', 'delivered', '${org}', null)`), /cerrado/);
  assert.equal(Number(await scalar(`select points_balance from premium_members where id='${member}'`)), 20);

  // Canje de premio: descuenta puntos; cancelar los devuelve.
  const redeemed = await db.query<{ order_id: string; points_balance: number }>(
    `select * from member_place_order('${member}', 'consumo', '[{"id":"${premio}","qty":1}]'::jsonb, 'en_barra', null, null, null)`
  );
  assert.equal(Number(redeemed.rows[0].points_balance), 5);
  await assert.rejects(() => db.query(`select * from member_place_order('${member}', 'consumo', '[{"id":"${premio}","qty":1}]'::jsonb, 'en_barra', null, null, null)`), /puntos/);
  await db.query(`select * from member_order_set_status('${redeemed.rows[0].order_id}', 'cancelled', '${org}', null)`);
  assert.equal(Number(await scalar(`select points_balance from premium_members where id='${member}'`)), 20);

  // Cancelar un pedido pagado con saldo lo devuelve; otra organizacion no puede tocarlo.
  const paid = await db.query<{ order_id: string }>(`select * from member_place_order('${member}', 'consumo', '[{"id":"${fernet}","qty":1}]'::jsonb, 'wallet', null, null, null)`);
  assert.equal(Number(await scalar(`select balance_minor from premium_members where id='${member}'`)), 1000);
  await assert.rejects(() => db.query(`select * from member_order_set_status('${paid.rows[0].order_id}', 'cancelled', '${otherOrg}', null)`), /permiso/);
  await db.query(`select * from member_order_set_status('${paid.rows[0].order_id}', 'cancelled', '${org}', null)`);
  assert.equal(Number(await scalar(`select balance_minor from premium_members where id='${member}'`)), 4000);
  assert.equal(
    Number(await scalar(`select sum(amount_minor)::text from wallet_transactions where member_id='${member}'`)),
    -6000,
    "el ledger refleja el pedido de 6000 y el de 3000 cobrado y reembolsado"
  );

  // Puntos por asistencia: una sola vez por fiesta, solo si el organizador los definio.
  const noPoints = await db.query<{ points_awarded: number }>(`select * from member_checkin_award('${member}', '${event}')`);
  assert.equal(Number(noPoints.rows[0].points_awarded), 0, "sin puntos configurados no suma nada");
  await db.exec(`update organizations set member_checkin_points = 25 where id='${org}'; delete from member_checkins;`);
  const first = await db.query<{ points_awarded: number }>(`select * from member_checkin_award('${member}', '${event}')`);
  const second = await db.query<{ points_awarded: number }>(`select * from member_checkin_award('${member}', '${event}')`);
  assert.equal(Number(first.rows[0].points_awarded), 25);
  assert.equal(Number(second.rows[0].points_awarded), 0, "escanear de nuevo la misma fiesta no vuelve a sumar");
  assert.equal(Number(await scalar(`select points_balance from premium_members where id='${member}'`)), 45);

  // Entrega en mesa y metricas del panel.
  const delivered = await db.query<{ order_id: string }>(
    `select * from member_place_order('${member}', 'consumo', '[{"id":"${fernet}","qty":1}]'::jsonb, 'en_barra', null, 'sin hielo', null, 'Mesa 7')`
  );
  assert.equal(await scalar(`select delivery from member_orders where id='${delivered.rows[0].order_id}'`), "Mesa 7");
  await db.query(`select * from member_order_set_status('${delivered.rows[0].order_id}', 'delivered', '${org}', null)`);
  const metrics = await scalar(`select member_metrics('${org}', now() - interval '1 day')`) as {
    members: { total: number }; period: { revenue_minor: number; delivered: number };
    top_spenders: { code: string; spent_minor: number }[]; top_points: { code: string }[]; top_products: { name: string; qty: number }[];
  };
  assert.equal(metrics.members.total, 1);
  assert.equal(metrics.period.delivered, 2);
  assert.equal(Number(metrics.period.revenue_minor), 9000);
  assert.equal(metrics.top_spenders[0].code, "APP111");
  assert.equal(metrics.top_points[0].code, "APP111");
  assert.equal(metrics.top_products[0].name, "Fernet");
  assert.equal(Number(metrics.top_products[0].qty), 3);

  // Reserva de mesa: se ocupa, nadie mas puede tomarla, cancelar la libera.
  const table = await scalar(`insert into bar_tables(event_id,name,capacity,price_minor) values ('${event}','Mesa VIP',6,4000) returning id::text`);
  const reserved = await db.query<{ order_id: string }>(`select * from member_place_order('${member}', 'mesa', '[]'::jsonb, 'wallet', '${table}', null, null)`);
  assert.equal(await scalar(`select status from bar_tables where id='${table}'`), "reserved");
  assert.equal(Number(await scalar(`select balance_minor from premium_members where id='${member}'`)), 0, "la mesa se pago con el saldo restante");
  await assert.rejects(() => db.query(`select * from member_place_order('${member}', 'mesa', '[]'::jsonb, 'en_barra', '${table}', null, null)`), /ya no esta disponible/);
  await db.query(`select * from member_order_set_status('${reserved.rows[0].order_id}', 'cancelled', '${org}', null)`);
  assert.equal(await scalar(`select status from bar_tables where id='${table}'`), "available");
  assert.equal(Number(await scalar(`select balance_minor from premium_members where id='${member}'`)), 4000, "cancelar la reserva devuelve el saldo");

  await db.close();
});

test("ranking de socios: cuenta puntos ganados, ignora canjes y reembolsos, maneja empates y se puede apagar", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "adadadad-1111-4111-8111-111111111111";
  const otherOrg = "adadadad-2222-4222-8222-222222222222";
  await db.exec(`insert into organizations(id,name,slug) values ('${org}','Club Rank','club-rank'), ('${otherOrg}','Otro Rank','otro-rank')`);

  const mk = (orgId: string, first: string, last: string, code: string) =>
    scalar(`insert into premium_members(organization_id, first_name, last_name, member_code) values ('${orgId}','${first}','${last}','${code}') returning id::text`) as Promise<string>;
  const ana = await mk(org, "Ana", "Lopez", "RK0001");
  const beto = await mk(org, "Beto", "Garcia", "RK0002");
  const cami = await mk(org, "Cami", "Diaz", "RK0003");
  const nadie = await mk(org, "Nadie", "Suma", "RK0004");
  const ajeno = await mk(otherOrg, "Ajeno", "Otro", "RK0005");

  const tx = (member: string, delta: number, reason: string, when = "now()") =>
    db.exec(`insert into member_points_transactions(member_id, delta, reason, created_at) values ('${member}', ${delta}, '${reason}', ${when})`);
  await tx(ana, 100, "Pedido AAAA");
  await tx(ana, -60, "Canje pedido BBBB"); // canjear no la baja
  await tx(beto, 100, "Asistencia a la fiesta");
  await tx(beto, 50, "Reembolso pedido CCCC"); // reembolso no cuenta
  await tx(cami, 40, "Pedido DDDD");
  await tx(cami, 500, "Pedido VIEJO", "now() - interval '90 days'"); // fuera del periodo
  await tx(ajeno, 999, "Pedido AJENO");

  const since = "now() - interval '30 days'";
  const ranking = (await scalar(`select member_ranking('${cami}', ${since})`)) as {
    enabled: boolean; participants: number; top: { position: number; name: string; points: number; isMe: boolean }[]; me: { position: number; points: number } | null;
  };
  assert.equal(ranking.enabled, true);
  assert.equal(ranking.participants, 3, "solo entran los que sumaron en el periodo, de su propio boliche");
  assert.deepEqual(ranking.top.map((r) => [r.position, r.name, r.points]), [[1, "Ana L.", 100], [2, "Beto G.", 100], [3, "Cami D.", 40]], "el empate lo gana quien llego primero al puntaje, y el nombre va con inicial");
  assert.equal(ranking.me?.position, 3);
  assert.equal(ranking.top[2].isMe, true);

  const historic = (await scalar(`select member_ranking('${cami}', '2000-01-01')`)) as { top: { name: string; points: number }[] };
  assert.equal(historic.top[0].name, "Cami D.", "en el historico cuenta lo de hace 90 dias");
  assert.equal(historic.top[0].points, 540);

  const outsider = (await scalar(`select member_ranking('${nadie}', ${since})`)) as { me: unknown };
  assert.equal(outsider.me, null, "quien no sumo puntos no tiene posicion");

  await db.exec(`update organizations set member_ranking_enabled = false where id='${org}'`);
  const off = (await scalar(`select member_ranking('${ana}', ${since})`)) as { enabled: boolean; top: unknown[] };
  assert.equal(off.enabled, false);
  assert.equal(off.top.length, 0);

  await db.close();
});

test("premio mensual: el cierre guarda ganadores con desempate, no duplica y respeta puestos sin premio", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "afafafaf-1111-4111-8111-111111111111";
  const orgNoPrize = "afafafaf-2222-4222-8222-222222222222";
  await db.exec(`insert into organizations(id,name,slug,member_prize_1,member_prize_2) values ('${org}','Club Premio','club-premio','Mesa VIP','2 tragos'), ('${orgNoPrize}','Sin Premio','sin-premio',null,null)`);

  const mk = (orgId: string, first: string, code: string) =>
    scalar(`insert into premium_members(organization_id, first_name, last_name, member_code) values ('${orgId}','${first}','Perez','${code}') returning id::text`) as Promise<string>;
  const ana = await mk(org, "Ana", "PM0001");
  const beto = await mk(org, "Beto", "PM0002");
  const cami = await mk(org, "Cami", "PM0003");
  const dani = await mk(org, "Dani", "PM0004");
  const otro = await mk(orgNoPrize, "Otro", "PM0005");

  const tx = (member: string, delta: number, reason: string, when: string) =>
    db.exec(`insert into member_points_transactions(member_id, delta, reason, created_at) values ('${member}', ${delta}, '${reason}', '${when}')`);
  await tx(ana, 100, "Pedido A", "2026-03-10T12:00:00Z");
  await tx(beto, 60, "Pedido B", "2026-03-05T12:00:00Z");
  await tx(beto, 40, "Pedido B2", "2026-03-20T12:00:00Z"); // llega a 100 despues que Ana: pierde el desempate
  await tx(cami, 50, "Pedido C", "2026-03-11T12:00:00Z");
  await tx(dani, 999, "Pedido D", "2026-04-02T12:00:00Z"); // abril: fuera del mes que se cierra
  await tx(otro, 500, "Pedido O", "2026-03-11T12:00:00Z");

  const from = "2026-03-01T03:00:00Z";
  const to = "2026-04-01T03:00:00Z";
  const close = () => scalar(`select member_close_month('${org}', '2026-03', '${from}', '${to}')`);

  assert.equal(Number(await close()), 2, "solo los puestos 1 y 2 tienen premio");
  assert.equal(Number(await close()), 0, "cerrar de nuevo no duplica");

  const winners = (await db.query<{ position: number; prize: string; member_id: string; points: number }>(
    `select position, prize, member_id::text, points from member_monthly_winners where organization_id='${org}' order by position`
  )).rows;
  assert.deepEqual(winners.map((w) => [w.position, w.prize, w.member_id, w.points]), [[1, "Mesa VIP", ana, 100], [2, "2 tragos", beto, 100]]);

  assert.equal(Number(await scalar(`select member_close_month('${orgNoPrize}', '2026-03', '${from}', '${to}')`)), 0, "sin premios configurados no registra ganadores");

  // El ranking que ve el socio muestra los premios y usa el mismo desempate.
  const ranking = (await scalar(`select member_ranking('${cami}', '${from}')`)) as { prizes: { position: number; prize: string }[]; top: { name: string }[] };
  assert.deepEqual(ranking.prizes, [{ position: 1, prize: "Mesa VIP" }, { position: 2, prize: "2 tragos" }]);

  await db.close();
});

test("recarga de saldo: acredita una sola vez por pago, permite reintento tras rechazo y descuenta lo que quede si reembolsan", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "aeaeaeae-1111-4111-8111-111111111111";
  await db.exec(`insert into organizations(id,name,slug) values ('${org}','Club Recarga','club-recarga')`);
  const member = await scalar(`insert into premium_members(organization_id, first_name, last_name, member_code) values ('${org}','Ana','Recarga','RC0001') returning id::text`);
  const balance = async () => Number(await scalar(`select balance_minor from premium_members where id='${member}'`));
  const newTopup = (amount: number) => scalar(`insert into wallet_topups(organization_id, member_id, amount_minor) values ('${org}','${member}',${amount}) returning id::text`) as Promise<string>;
  const apply = (topup: string, payment: string, status: string) =>
    db.query<{ applied: boolean; new_status: string }>(`select * from member_wallet_topup_apply('${topup}', '${payment}', '${status}')`);

  // Snapshot de la cuenta MP usada para la preference de esta recarga --
  // mismo bug ya arreglado para ventas de entradas (20261011): sin esto,
  // reconectar Mercado Pago mientras una recarga esta pendiente dejaba la
  // verificacion comparando contra la cuenta equivocada para siempre.
  const snapshotTopup = await scalar(
    `insert into wallet_topups(organization_id, member_id, amount_minor, mercadopago_collector_id) values ('${org}','${member}',3000,999) returning id::text`
  );
  assert.equal(await scalar(`select mercadopago_collector_id::int from wallet_topups where id='${snapshotTopup}'`), 999);

  // Pendiente / en proceso no acredita nada.
  const first = await newTopup(5000);
  assert.equal((await apply(first, "111", "in_process")).rows[0].applied, false);
  assert.equal(await balance(), 0);

  // Aprobado acredita; el reintento del webhook (o "verificar") no duplica.
  assert.equal((await apply(first, "111", "approved")).rows[0].applied, true);
  assert.equal(await balance(), 5000);
  assert.equal((await apply(first, "111", "approved")).rows[0].applied, false);
  assert.equal(await balance(), 5000, "un segundo aviso del mismo pago no acredita de nuevo");
  assert.equal(Number(await scalar(`select sum(amount_minor)::text from wallet_transactions where member_id='${member}'`)), 5000);

  // El mismo pago de Mercado Pago no puede acreditar otra recarga.
  const other = await newTopup(5000);
  assert.equal((await apply(other, "111", "approved")).rows[0].applied, false);
  assert.equal(await balance(), 5000);
  assert.equal(await scalar(`select status from wallet_topups where id='${other}'`), "pending");

  // Rechazado y despues aprobado (reintento con la misma preferencia).
  assert.equal((await apply(other, "222", "rejected")).rows[0].new_status, "rejected");
  assert.equal(await balance(), 5000);
  assert.equal((await apply(other, "333", "approved")).rows[0].applied, true);
  assert.equal(await balance(), 10000);

  // Reembolso despues de gastar: solo se descuenta lo que queda.
  await db.exec(`update premium_members set balance_minor = 2000 where id='${member}'`);
  const refunded = await apply(other, "333", "refunded");
  assert.equal(refunded.rows[0].new_status, "refunded");
  assert.equal(await balance(), 0, "no queda saldo negativo si ya consumio parte");
  assert.equal((await apply(other, "333", "refunded")).rows[0].applied, false, "el reembolso tampoco se aplica dos veces");

  // Pago repetido del mismo link (dos pestañas): el segundo pago aprobado
  // tambien se cobro, asi que tambien se acredita -- antes se perdia.
  const twice = await newTopup(4000);
  await db.exec(`update premium_members set balance_minor = 0 where id='${member}'`);
  assert.equal((await apply(twice, "444", "approved")).rows[0].applied, true);
  assert.equal((await apply(twice, "555", "approved")).rows[0].applied, true, "el segundo pago se acredita");
  assert.equal(await balance(), 8000);
  assert.equal((await apply(twice, "555", "approved")).rows[0].applied, false, "pero el mismo pago repetido no");
  assert.equal(await balance(), 8000);
  assert.equal(await scalar(`select count(*)::int from wallet_topups where mp_payment_id in ('444','555')`), 2);

  // El reembolso del pago repetido descuenta solo ese, y no toca la recarga original.
  assert.equal((await apply(twice, "555", "refunded")).rows[0].applied, true);
  assert.equal(await balance(), 4000);
  assert.equal(await scalar(`select status from wallet_topups where id='${twice}'`), "approved");
  // Un reembolso de un pago que no es de esta recarga no hace nada.
  assert.equal((await apply(twice, "999", "refunded")).rows[0].applied, false);
  assert.equal(await balance(), 4000);

  await db.close();
});

test("calendario de rental: rental_bookings valida que ends_on no sea anterior a starts_on", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  const asset = await db.query<{ id: string }>(`insert into rental_assets(name) values ('Terminal Nº1') returning id`);
  const assetId = asset.rows[0].id;

  await db.exec(`insert into rental_bookings(asset_id, client_name, starts_on, ends_on) values ('${assetId}', 'Bar Los Alamos', '2026-04-10', '2026-04-15')`);
  assert.equal(await scalar(`select count(*)::int from rental_bookings where asset_id='${assetId}'`), 1);

  await assert.rejects(
    () => db.query(`insert into rental_bookings(asset_id, client_name, starts_on, ends_on) values ('${assetId}', 'Otro', '2026-04-15', '2026-04-10')`),
    /violates check constraint/,
    "la fecha de fin no puede ser anterior a la de inicio"
  );

  // Si se borra el equipo, sus reservas se van con el.
  await db.exec(`delete from rental_assets where id='${assetId}'`);
  assert.equal(await scalar(`select count(*)::int from rental_bookings where asset_id='${assetId}'`), 0);

  await db.close();
});

test("calendario de rental: rental_create_booking/rental_update_booking rechazan solapamientos y mueven una reserva de forma atomica", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];

  const assetId = await scalar(`insert into rental_assets(name) values ('Terminal Nº1') returning id::text`);
  const otherAssetId = await scalar(`insert into rental_assets(name) values ('Terminal Nº2') returning id::text`);

  const created = await db.query<{ id: string; starts_on: string; ends_on: string }>(
    `select id, starts_on::text, ends_on::text from rental_create_booking('${assetId}','Bar Los Alamos','2026-04-10','2026-04-15')`
  );
  const bookingId = created.rows[0].id;
  assert.equal(created.rows[0].starts_on, "2026-04-10");

  // Fechas invalidas y cliente vacio los rechaza la funcion, no solo el constraint de la tabla.
  await assert.rejects(() => db.query(`select * from rental_create_booking('${assetId}','Otro','2026-04-20','2026-04-18')`), /no puede ser anterior/);
  await assert.rejects(() => db.query(`select * from rental_create_booking('${assetId}','   ','2026-05-01','2026-05-02')`), /Ingresá el cliente/);
  await assert.rejects(() => db.query(`select * from rental_create_booking('00000000-0000-4000-8000-000000000000','X','2026-05-01','2026-05-02')`), /no existe/);

  // Se solapa con la reserva ya creada -> rechazado, con el nombre del choque en el mensaje.
  await assert.rejects(
    () => db.query(`select * from rental_create_booking('${assetId}','Otro cliente','2026-04-14','2026-04-20')`),
    /Bar Los Alamos/,
    "el mensaje de error dice con quien choca"
  );
  // El mismo rango en OTRO equipo no tiene problema.
  await db.query(`select * from rental_create_booking('${otherAssetId}','Otro cliente','2026-04-14','2026-04-20')`);

  // Mover la reserva a fechas libres: una sola llamada atomica, no cancelar + crear.
  const moved = await db.query<{ starts_on: string; ends_on: string; client_name: string }>(
    `select starts_on::text, ends_on::text, client_name from rental_update_booking('${bookingId}','Bar Los Alamos (renombrado)','2026-05-01','2026-05-05')`
  );
  assert.equal(moved.rows[0].starts_on, "2026-05-01");
  assert.equal(moved.rows[0].client_name, "Bar Los Alamos (renombrado)");
  assert.equal(Number(await scalar(`select count(*)::int from rental_bookings where asset_id='${assetId}'`)), 1, "se actualizo la misma fila, no se creo una nueva");

  // Mover una reserva a fechas que chocan con OTRA reserva existente del mismo equipo: se rechaza y NO se pierde la original.
  const second = await scalar(`select id::text from rental_create_booking('${assetId}','Segunda reserva','2026-06-01','2026-06-05')`);
  await assert.rejects(
    () => db.query(`select * from rental_update_booking('${bookingId}','Bar Los Alamos','2026-06-03','2026-06-10')`),
    /Segunda reserva/
  );
  assert.equal(await scalar(`select starts_on::text from rental_bookings where id='${bookingId}'`), "2026-05-01", "la reserva original no se toco al fallar el movimiento");
  assert.equal(await scalar(`select count(*)::int from rental_bookings where id='${second}'`), 1);

  await db.close();
});

test("sales.ticket_email_sent_at se reclama una sola vez (evita mandar la entrada por mail 2 veces)", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const saleId = "88888888-8888-4888-8888-888888888888";

  await db.exec(`insert into sales(id, channel) values ('${saleId}', 'online')`);
  assert.equal(await scalar(`select ticket_email_sent_at from sales where id='${saleId}'`), null);

  const claim = async (n: string) => {
    const result = await db.query<{ id: string }>(
      `update sales set ticket_email_sent_at = '${n}' where id='${saleId}' and ticket_email_sent_at is null returning id`
    );
    return result.rows;
  };

  // Simula el webhook real de Mercado Pago y el "Verificar mi pago" del
  // comprador llegando casi al mismo tiempo -- solo el primero debe
  // quedarse con el envio del mail.
  assert.equal((await claim("2026-01-01T00:00:00Z")).length, 1, "la primera llamada reclama el envio");
  assert.equal((await claim("2026-01-01T00:00:01Z")).length, 0, "la segunda no encuentra nada para reclamar -- no reenvia el mail");

  await db.close();
});

test("suscripcion: renovar antes de vencer suma dias, ventana de 7 dias, cortesia y link viejo de otro plan", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const user = "e1111111-1111-4111-8111-111111111111";
  const plan = "e2222222-2222-4222-8222-222222222222";
  const planB = "e3333333-3333-4333-8333-333333333333";
  await db.exec(`insert into auth.users values ('${user}','renueva@example.test',now(),'{"first_name":"Renu","last_name":"Eva","organization_name":"Club Renueva"}');
    insert into subscription_plans(id,code,name,price_minor) values ('${plan}','renueva-basica','Básica',10000);
    insert into subscription_plans(id,code,name,price_minor) values ('${planB}','renueva-otra','Otra',20000);`);
  const org = await scalar(`select cp_ensure_account('${user}')`);
  const signup = await scalar(`select cp_prepare_checkout('${user}', '${plan}')->>'id'`);

  // Pagado hace 25 dias: le quedan ~5 dias.
  await db.query(`select cp_record_payment('${signup}','renueva-1','approved',10000,'ARS', now() - interval '25 days', now())`);
  assert.equal(await scalar(`select cp_org_has_service('${org}')`), true);
  const firstEnd = await scalar("select period_end::text from subscription_payments where payment_id = 'renueva-1'");

  // Dentro de los ultimos 7 dias SI puede preparar la renovacion (antes: "El servicio ya esta activo").
  assert.equal(await scalar(`select cp_prepare_checkout('${user}', '${plan}')->>'id'`), signup, "mismo plan y precio: reusa la solicitud");

  // Renueva hoy: el periodo nuevo arranca donde termina el actual, no hoy.
  await db.query(`select cp_record_payment('${signup}','renueva-2','approved',10000,'ARS', now(), now())`);
  assert.equal(await scalar("select period_start::text from subscription_payments where payment_id = 'renueva-2'"), firstEnd, "arranca al vencimiento anterior");
  assert.equal(
    await scalar(`select (period_end = period_start + interval '1 month')::text from subscription_payments where payment_id = 'renueva-2'`), "true");
  assert.equal(
    await scalar(`select current_period_end::text from organization_subscriptions where signup_id = '${signup}'`),
    await scalar("select period_end::text from subscription_payments where payment_id = 'renueva-2'"),
    "el vencimiento visible es el del periodo sumado");

  // Un reintento del webhook del pago 2 no recalcula su periodo.
  const secondEnd = await scalar("select period_end::text from subscription_payments where payment_id = 'renueva-2'");
  await db.query(`select cp_record_payment('${signup}','renueva-2','approved',10000,'ARS', now(), now())`);
  assert.equal(await scalar("select period_end::text from subscription_payments where payment_id = 'renueva-2'"), secondEnd);

  // Ya renovado: le quedan ~35 dias, fuera de la ventana de 7.
  await assert.rejects(() => db.query(`select cp_prepare_checkout('${user}', '${plan}')`), /7 días antes/);

  // Sube el precio del plan: la proxima renovacion es una solicitud nueva
  // con el precio nuevo, y un reembolso del pago viejo sigue verificando
  // contra lo que se cobro.
  await db.exec(`update subscription_payments set period_end = now() + interval '3 days' where payment_id = 'renueva-2';
    update subscription_plans set price_minor = 12000 where id = '${plan}';`);
  const renewed = await scalar(`select cp_prepare_checkout('${user}', '${plan}')->>'id'`);
  assert.notEqual(renewed, signup, "precio nuevo = solicitud nueva");
  assert.equal(Number(await scalar(`select expected_amount from subscription_signups where id = '${renewed}'`)), 12000);
  await db.query(`select cp_record_payment('${signup}','renueva-1','refunded',10000,'ARS', now() - interval '25 days', now() + interval '1 second')`);
  assert.equal(await scalar("select status from subscription_payments where payment_id = 'renueva-1'"), "refunded");

  // Link viejo de otro plan: genera link del plan B, cambia de idea, y
  // termina pagando el link del plan B igual -- se acredita por su monto.
  const viaB = await scalar(`select cp_prepare_checkout('${user}', '${planB}')->>'id'`);
  assert.notEqual(viaB, renewed);
  await db.query(`select cp_record_payment('${viaB}','renueva-b','approved',20000,'ARS', now(), now())`);
  assert.equal(await scalar("select status from subscription_payments where payment_id = 'renueva-b'"), "approved");
  // Y despues paga tambien el link basico: se suma despues del de B.
  await db.query(`select cp_record_payment('${renewed}','renueva-3','approved',12000,'ARS', now(), now())`);
  assert.equal(
    await scalar("select (p3.period_start = pb.period_end)::text from subscription_payments p3, subscription_payments pb where p3.payment_id = 'renueva-3' and pb.payment_id = 'renueva-b'"),
    "true", "cada pago se suma al final del ultimo");

  // Cuenta de cortesia: nunca le pide pagar.
  await db.exec(`update organizations set complimentary = true where id = '${org}'`);
  await db.exec(`update subscription_payments set period_end = now() + interval '1 day', period_start = now() - interval '1 day' where signup_id in (select id from subscription_signups where organization_id = '${org}')`);
  await assert.rejects(() => db.query(`select cp_prepare_checkout('${user}', '${plan}')`), /cortesía/);

  await db.close();
});

test("ingreso con usuario o celular: cp_login_email traduce al email de la cuenta y no adivina si el celular esta repetido", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const rrpp = "f1111111-1111-4111-8111-111111111111";
  const legacyRrpp = "f2222222-2222-4222-8222-222222222222";
  const a = "f3333333-3333-4333-8333-333333333333";
  const b = "f4444444-4444-4444-8444-444444444444";
  await db.exec(`insert into auth.users values ('${rrpp}','juan@example.test',now(),'{}');
    insert into auth.users values ('${legacyRrpp}','viejo@example.test',now(),'{"phone":"+54 9 11 5555-1234"}');
    insert into auth.users values ('${a}','a@example.test',now(),'{}');
    insert into auth.users values ('${b}','b@example.test',now(),'{}');
    insert into profiles(id, first_name, last_name, phone, username) values ('${rrpp}','Juan','Perez','03468 529047','juanperez');
    insert into profiles(id, first_name, last_name) values ('${legacyRrpp}','Viejo','Rrpp');
    insert into profiles(id, first_name, last_name, phone) values ('${a}','A','Uno','3462 111222'), ('${b}','B','Dos','+5493462111222');`);

  assert.equal(await scalar(`select cp_login_email('JuanPerez')`), "juan@example.test", "usuario sin importar mayusculas");
  assert.equal(await scalar(`select cp_login_email(' Juan@Example.test ')`), "juan@example.test", "email tal cual, en minusculas");
  assert.equal(await scalar(`select cp_login_email('+54 9 3468 52-9047')`), "juan@example.test", "celular con otro formato");
  assert.equal(await scalar(`select cp_login_email('1155551234')`), "viejo@example.test", "celular guardado solo en user_metadata (RRPP viejos)");
  assert.equal(await scalar(`select cp_login_email('3462111222')`), null, "celular en dos cuentas: no adivina");
  assert.equal(await scalar(`select cp_login_email('noexiste')`), null);
  assert.equal(await scalar(`select cp_login_email('12345')`), null, "pocos digitos no matchea nada");

  // El "15" de los celulares: guardado con 15 y tipeado sin, o al reves.
  const con15 = "f5555555-5555-4555-8555-555555555555";
  await db.exec(`insert into auth.users values ('${con15}','con15@example.test',now(),'{}');
    insert into profiles(id, first_name, last_name, phone) values ('${con15}','Con','Quince','0341 15 555-6666');`);
  assert.equal(await scalar(`select cp_login_email('3415556666')`), "con15@example.test", "guardado con 15, tipeado sin 15");
  assert.equal(await scalar(`select cp_login_email('+54 9 341 555 6666')`), "con15@example.test");
  assert.equal(await scalar(`select cp_login_email('3468 15 529047')`), "juan@example.test", "guardado sin 15, tipeado con 15");
  assert.equal(await scalar(`select cp_login_email('011 15 5555-1234')`), "viejo@example.test", "AMBA con 15");

  // Usuario unico sin importar mayusculas, y con formato valido.
  await assert.rejects(() => db.query(`update profiles set username = 'JUANPEREZ' where id = '${a}'`), /profiles_username/);
  await assert.rejects(() => db.query(`update profiles set username = 'juanperez' where id = '${a}'`), /duplicate|unique/i);

  // Solo el servidor puede llamarla.
  await db.exec(`set role authenticated;`);
  await assert.rejects(() => db.query(`select cp_login_email('juanperez')`), /permission denied/);
  await db.exec("reset role;");

  await db.close();
});

test("cuentas del mes: la tabla rechaza montos y dias invalidos y solo la usa el servidor", async () => {
  const db = await database();
  await db.exec(`insert into finance_fixed_items(scope, kind, name, amount, currency, day_of_month) values ('personal','gasto','Claude',20,'USD',10)`);
  await assert.rejects(() => db.query(`insert into finance_fixed_items(kind, name, amount) values ('gasto','Cero',0)`), /check/i);
  await assert.rejects(() => db.query(`insert into finance_fixed_items(kind, name, amount, day_of_month) values ('gasto','Dia',10,32)`), /check/i);
  await assert.rejects(() => db.query(`insert into finance_fixed_items(kind, name, amount, currency) values ('gasto','Euros',10,'EUR')`), /check/i);
  await db.exec("set role authenticated;");
  await assert.rejects(() => db.query("select * from finance_fixed_items"), /permission denied/);
  await db.exec("reset role;");
  await db.close();
});

test("estado automatico: los eventos pasan solos a Activo y a Finalizado, una sola vez, sin tocar borradores ni cancelados", async () => {
  const db = await database();
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  const org = "a7a7a7a7-1111-4111-8111-111111111111";
  const ev = (n: string) => `a7a7a7a7-2222-4222-8222-${n.padStart(12, "0")}`;
  await db.exec(`insert into organizations(id,name,slug,complimentary) values ('${org}','Club Auto','club-auto',true);
    insert into events(id,organization_id,status,starts_at,ends_at) values
      ('${ev("1")}','${org}','upcoming', now() + interval '3 hours', null),
      ('${ev("2")}','${org}','upcoming', now() + interval '2 days', null),
      ('${ev("3")}','${org}','active',   now() - interval '3 days', now() - interval '2 days'),
      ('${ev("4")}','${org}','active',   now() - interval '5 hours', now() + interval '2 hours'),
      ('${ev("5")}','${org}','draft',    now() + interval '1 hour', null),
      ('${ev("6")}','${org}','cancelled',now() + interval '1 hour', null),
      ('${ev("7")}','${org}','upcoming', now() - interval '3 days', null);`);
  const status = (n: string) => scalar(`select status::text from events where id='${ev(n)}'`);

  const first = (await db.query<{ activated: number; finished: number }>(`select * from cp_auto_event_status()`)).rows[0];
  assert.equal(await status("1"), "active", "arranca en 3 horas: ya se activa");
  assert.equal(await status("2"), "upcoming", "falta mucho: no se toca");
  assert.equal(await status("3"), "finished", "termino hace 2 dias: se finaliza");
  assert.equal(await status("4"), "active", "esta en curso: sigue activo");
  assert.equal(await status("5"), "draft", "un borrador nunca se toca");
  assert.equal(await status("6"), "cancelled", "un cancelado nunca se toca");
  assert.equal(await status("7"), "finished", "uno viejo que nunca se activo se finaliza directo");
  assert.equal(Number(first.activated), 1);
  assert.equal(Number(first.finished), 2);

  // Si el organizador lo vuelve a poner a mano, se respeta.
  await db.exec(`update events set status = 'upcoming' where id = '${ev("1")}'; update events set status = 'active' where id = '${ev("3")}';`);
  await db.query(`select * from cp_auto_event_status()`);
  assert.equal(await status("1"), "upcoming", "no se re-activa algo que el organizador cambio a mano");
  assert.equal(await status("3"), "active", "no se re-finaliza algo que el organizador reactivo a mano");

  // Solo el servidor puede correrla.
  await db.exec(`set role authenticated;`);
  await assert.rejects(() => db.query(`select * from cp_auto_event_status()`), /permission denied/);
  await db.exec("reset role;");

  await db.close();
});
