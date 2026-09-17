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
const q = (v: string) => '"' + v.replaceAll('"', '""') + '"';
const str = (v: string) => "'" + v.replaceAll("'", "''") + "'";

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;`);
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
  await db.exec(`create table events(id uuid primary key, organization_id uuid, status public.event_status);
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
      ticket_type_id uuid, status public.ticket_status default 'issued', display_number integer, manual_code text);
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
  const returnedItems = created.rows[0].items as { ticket_type_id: string; name: string; quantity: number; unit_price_minor: number }[];
  assert.deepEqual(returnedItems, [{ ticket_type_id: ticketType, name: "General", quantity: 2, unit_price_minor: 5000 }],
    "el detalle de items debe salir de la misma lectura que valida el cupo, no de una lectura aparte del caller");
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

  // El bartender vende un trago: debe descontar stock de SU barra.
  await db.exec(`select set_config('request.jwt.claim.sub','${bartenderUser}',false);`);
  const barSale = await db.query<{ bar_sale_id: string; total_minor: string }>(
    `select bar_sale_id, total_minor from create_bartender_sale('${bar}','${table}','${eventProduct}',3,'transferencia')`
  );
  assert.equal(Number(barSale.rows[0].total_minor), 6000, "3 tragos a 2000 cada uno");
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProduct}'`), 5, "8 asignados - 3 vendidos");
  assert.equal(await scalar(`select count(*)::int from stock_movements where type='venta'`), 1);

  // No puede vender mas de lo que le queda en la barra.
  await assert.rejects(
    () => db.query(`select create_bartender_sale('${bar}','${table}','${eventProduct}',10,'efectivo')`),
    /No hay suficiente stock en esta barra/
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

  // Ajuste manual por perdida (ej: se rompio una botella).
  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false);`);
  await db.query(`select adjust_bar_stock('${bar}','${eventProduct}',-1,'perdida','Se rompio una botella')`);
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProduct}'`), 4);

  // No puede dejar el stock en negativo.
  await assert.rejects(
    () => db.query(`select adjust_bar_stock('${bar}','${eventProduct}',-100,'perdida','Motivo')`),
    /negativo/
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
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProduct}'`), 3, "4 - 1 vendido sin mesa");

  // Un bartender no puede cancelar ventas (solo el organizador).
  await assert.rejects(
    () => db.query(`select cancel_bar_sale('${barSaleNoTable.rows[0].bar_sale_id}','Me equivoque de trago')`),
    /No tenes permiso/
  );

  // El organizador cancela la venta de barra: el stock vuelve y queda registrado el motivo.
  await db.exec(`select set_config('request.jwt.claim.sub','${organizerUser}',false);`);
  await db.query(`select cancel_bar_sale('${barSaleNoTable.rows[0].bar_sale_id}','Me equivoque de trago')`);
  assert.equal(await scalar(`select quantity from bar_stock where bar_id='${bar}' and event_product_id='${eventProduct}'`), 4, "vuelve el trago cancelado");
  assert.ok(await scalar(`select cancelled_at from bar_sales where id='${barSaleNoTable.rows[0].bar_sale_id}'`), "debe quedar marcada como cancelada");

  // No se puede cancelar dos veces la misma venta.
  await assert.rejects(
    () => db.query(`select cancel_bar_sale('${barSaleNoTable.rows[0].bar_sale_id}','De nuevo')`),
    /ya estaba cancelada/
  );

  // Cancelar una venta de mesa libera la mesa para volver a venderla.
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
