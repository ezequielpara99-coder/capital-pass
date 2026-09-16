import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

type Row = { seccion: string; objeto: string; detalle: unknown };
const fixture = JSON.parse(readFileSync(new URL("./schema.fixture.json", import.meta.url), "utf8")) as Row[];
const migration = readFileSync(new URL("../supabase/migrations/20260913_account_before_payment.sql", import.meta.url), "utf8");
const checkoutProMigration = readFileSync(new URL("../supabase/migrations/20260916_checkout_pro.sql", import.meta.url), "utf8");
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
    create table sales(id uuid primary key, seller_member_id uuid);
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
