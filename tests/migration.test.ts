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
  await db.exec(`create table events(id uuid primary key, organization_id uuid, status public.event_status,
      rrpp_sales_enabled boolean default true, rrpp_sales_cutoff_at timestamptz,
      door_sales_enabled boolean default true, door_sales_start_at timestamptz, door_sales_end_at timestamptz);
    create table event_staff(event_id uuid, organization_member_id uuid, staff_role public.event_staff_role, active boolean);
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

  await db.query("select set_online_sale_charged_total($1, 5250)", [sale]);
  assert.equal(await scalar(`select total_charged_minor::int from sales where id='${sale}'`), 5250, "guarda subtotal + cargo por servicio para verificar el pago despues");

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

  // Vender una mesa: la puede vender el organizador.
  const tableSale = await scalar(
    `select sale_id::text from sell_table('${event}','${table}','Cliente','Mesa','30111222','3462111222','efectivo')`
  );
  assert.equal(await scalar(`select channel from sales where id='${tableSale}'`), "mesa");
  assert.equal(await scalar(`select status from bar_tables where id='${table}'`), "reserved");

  // No se puede vender la misma mesa dos veces.
  await assert.rejects(
    () => db.query(`select sell_table('${event}','${table}','Otro','Cliente','30333444','3462333444','efectivo')`),
    /ya no esta disponible/
  );

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

  // Con la mesa liberada, se puede volver a vender.
  const resoldTable = await scalar(
    `select sale_id::text from sell_table('${event}','${table}','Otro','Cliente','30555666','3462555666','efectivo')`
  );
  assert.ok(resoldTable, "la mesa liberada se puede volver a vender");

  void organizerMember;
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
  await db.exec(`update subscription_plans set price_minor = 100000 where code = 'gestion_avanzada'`);
  const second = await db.query<{ result: { id: string; amount_minor: number; checkout_url: string | null } }>(
    `select cp_prepare_plan_upgrade('${organizerUser}','${avanzadaId}') as result`
  );
  assert.equal(second.rows[0].result.id, first.rows[0].result.id, "sigue siendo el mismo cobro pendiente, no uno nuevo");
  // (100000-10000)*~0.5 ~= 45000, bien distinto del ~90000 original.
  assert.ok(second.rows[0].result.amount_minor < 55000, `debe recalcular con el precio nuevo, no reusar el monto viejo; dio ${second.rows[0].result.amount_minor}`);
  assert.equal(second.rows[0].result.checkout_url, null, "el link de pago viejo (con el monto viejo) queda invalidado");

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
