// QA de punta a punta de la app del socio, contra la base REAL configurada en
// .env.local y un servidor de la app corriendo (por defecto http://localhost:3001,
// idealmente el build de produccion: `npm run build && npx next start -p 3001`).
//
//   QA_CONFIRM=si node scripts/qa/socio-e2e.mjs setup     -> crea datos "ZZ QA", corre las pruebas
//   QA_CONFIRM=si node scripts/qa/socio-e2e.mjs cleanup   -> borra TODO lo que creo
//
// IMPORTANTE: escribe (y despues borra) filas de prueba en la base real. Las
// organizaciones y eventos se llaman "ZZ QA ..." y se borran al final; si el
// script se corta a la mitad, corre `cleanup` (el estado se guarda en la
// carpeta temporal del sistema). No llama a Mercado Pago con credenciales
// reales: la cuenta conectada del boliche de prueba es falsa.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHmac } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.env.QA_CONFIRM !== "si") {
  console.log("Este script crea datos de prueba (ZZ QA) en la base de .env.local y los borra al final.");
  console.log("Para correrlo: QA_CONFIRM=si node scripts/qa/socio-e2e.mjs setup   (y cleanup si se corta)");
  process.exit(1);
}

const PROJECT = process.cwd();
const STATE = join(tmpdir(), "capital-pass-qa-socio-e2e.json");
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3001";
const require = createRequire(join(PROJECT, "package.json"));
const { createClient } = require("@supabase/supabase-js");

for (const line of readFileSync(join(PROJECT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const hm = (msg) => createHmac("sha256", process.env.TICKET_SIGNING_SECRET).update(msg).digest("base64url");
const memberSig = (id) => hm(`capital-pass-member:${id}`);
const sessionCookie = (email) => {
  const exp = Date.now() + 3600000;
  const payload = `session:${Buffer.from(email.trim().toLowerCase()).toString("base64url")}:${exp}`;
  return `${payload}:${hm(`capital-pass-customer:${payload}`)}`;
};
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

let pass = 0;
let fail = 0;
const check = (name, ok, extra = "") => {
  if (ok) { pass++; console.log(`  OK    ${name}`); } else { fail++; console.log(`  FALLA ${name} ${extra}`); }
};

async function api(path, init = {}, cookie) {
  const headers = { ...(init.headers ?? {}), ...(cookie ? { cookie: `cp_customer_session=${cookie}` } : {}) };
  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  let json = null;
  let text = "";
  try { text = await response.text(); json = JSON.parse(text); } catch { /* no era JSON */ }
  return { status: response.status, json, text };
}
const send = (method) => (path, body, cookie) => api(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, cookie);
const post = send("POST");
const patch = send("PATCH");
const del = send("DELETE");

async function cleanup() {
  if (!existsSync(STATE)) return console.log("No hay estado guardado: nada que borrar.");
  const s = JSON.parse(readFileSync(STATE, "utf8"));
  const remove = async (table, column, values) => {
    if (!values?.length) return;
    const r = await a.from(table).delete().in(column, values);
    if (r.error) console.log(`  (limpieza ${table}: ${r.error.message})`);
  };
  const ids = s.memberIds ?? [];
  if (s.routeId) await a.from("transfer_routes").update({ current_stop_id: null }).eq("id", s.routeId);
  await remove("transfer_notifications", "ticket_id", s.ticketIds);
  await remove("transfer_route_arrivals", "route_id", [s.routeId].filter(Boolean));
  await remove("transfer_tickets", "route_id", [s.routeId].filter(Boolean));
  await remove("transfer_route_stops", "route_id", [s.routeId].filter(Boolean));
  await remove("transfer_routes", "id", [s.routeId].filter(Boolean));
  await remove("member_push_subscriptions", "member_id", ids);
  await remove("member_orders", "member_id", ids);
  await remove("member_points_transactions", "member_id", ids);
  await remove("member_checkins", "member_id", ids);
  await remove("wallet_transactions", "member_id", ids);
  await remove("wallet_topups", "member_id", ids);
  await remove("member_monthly_winners", "organization_id", [s.orgId].filter(Boolean));
  await remove("member_levels", "organization_id", [s.orgId].filter(Boolean));
  await remove("member_point_boosts", "organization_id", [s.orgId].filter(Boolean));
  await remove("member_menu_items", "organization_id", [s.orgId].filter(Boolean));
  await remove("organization_purchases", "organization_id", [s.orgId].filter(Boolean));
  await remove("premium_members", "id", ids);
  // Ventas, entradas y compradores no se pueden borrar con el usuario de
  // servicio: lo hace una funcion de la base que SOLO acepta organizaciones
  // de prueba ("ZZ QA ...").
  if (s.orgId) {
    const purge = await a.rpc("cp_qa_purge_org", { p_org_id: s.orgId });
    if (purge.error) console.log(`  (limpieza de ventas de prueba: ${purge.error.message})`);
  }
  await remove("stock_movements", "event_id", [s.eventId].filter(Boolean));
  await remove("bar_stock", "bar_id", [s.barId].filter(Boolean));
  await remove("bars", "id", [s.barId].filter(Boolean));
  await remove("event_products", "event_id", [s.eventId].filter(Boolean));
  await remove("bar_tables", "event_id", [s.eventId].filter(Boolean));
  await remove("organization_mercadopago_accounts", "organization_id", [s.orgId].filter(Boolean));
  await remove("events", "id", [s.eventId].filter(Boolean));
  await remove("organizations", "id", [s.orgId].filter(Boolean));

  const orgs = await a.from("organizations").select("id").ilike("name", "ZZ QA%");
  const events = await a.from("events").select("id").ilike("name", "ZZ QA%");
  console.log(`Limpieza: organizaciones ZZ QA restantes=${orgs.data?.length}, eventos ZZ QA restantes=${events.data?.length}`);
  if ((orgs.data?.length ?? 0) > 0 || (events.data?.length ?? 0) > 0) console.log("  ATENCION: quedaron datos de prueba; revisalos a mano.");
  writeFileSync(STATE, "{}");
}

async function setup() {
  const stamp = Date.now();
  const s = { memberIds: [], ticketIds: [] };
  const save = () => writeFileSync(STATE, JSON.stringify(s));
  save();

  console.log("== Datos de prueba ==");
  const org = must(await a.from("organizations").insert({ name: "ZZ QA Boliche", slug: `zz-qa-${stamp}` }).select("id").single(), "org");
  s.orgId = org.id; save();
  must(await a.from("organizations").update({
    premium_memberships_enabled: true, member_checkin_points: 20, member_ranking_enabled: true,
    member_prize_1: "Mesa VIP QA", member_prize_2: "2 tragos QA", member_prize_3: null,
  }).eq("id", org.id), "org update");

  const event = must(await a.from("events").insert({
    organization_id: org.id, name: "ZZ QA Fiesta", slug: `zz-qa-fiesta-${stamp}`, status: "active",
    starts_at: new Date(Date.now() + 3 * 86400000).toISOString(), venue_name: "Club QA", city: "Rosario",
  }).select("id").single(), "evento");
  s.eventId = event.id; s.slug = `zz-qa-fiesta-${stamp}`; save();

  // Cuenta de Mercado Pago FALSA: solo para que la pagina muestre la compra online.
  const fakeMp = await a.from("organization_mercadopago_accounts").insert({
    organization_id: org.id, mp_user_id: 1, access_token: "qa-fake", refresh_token: "qa-fake",
    expires_at: new Date(Date.now() + 86400000).toISOString(), processing_fee_percent: 0,
  });
  if (fakeMp.error) console.log(`  (aviso: cuenta de MP falsa no creada: ${fakeMp.error.message})`);

  const table = must(await a.from("bar_tables").insert({ event_id: event.id, name: "Mesa QA", capacity: 6, price_minor: 3000 }).select("id").single(), "mesa");
  const table2 = must(await a.from("bar_tables").insert({ event_id: event.id, name: "Mesa QA 2", capacity: 4, price_minor: 5000 }).select("id").single(), "mesa 2");
  s.tableId = table.id; save();

  const mk = async (first, code, extra = {}) => {
    const m = must(await a.from("premium_members").insert({ organization_id: org.id, first_name: first, last_name: "Qa", member_code: code, ...extra }).select("id").single(), first);
    s.memberIds.push(m.id); save();
    return m.id;
  };
  const emailA = `qa-a-${stamp}@example.test`;
  const A = await mk("Ana", "QA0001", { phone: "3400000001", email: emailA, balance_minor: 20000 });
  const B = await mk("Beto", "QA0002", { balance_minor: 0 });
  const C = await mk("Cami", "QA0003", { balance_minor: 0, email: `qa-c-${stamp}@example.test` });
  const cookieA = sessionCookie(emailA);
  const S = (id) => `?s=${encodeURIComponent(memberSig(id))}`;
  const P = `/api/socio/${A}`;

  // Stock: un producto del catalogo, con 10 unidades en una barra.
  const product = must(await a.from("products").select("id").limit(1), "producto")[0];
  let ep = null;
  if (product) {
    ep = must(await a.from("event_products").insert({ event_id: event.id, product_id: product.id, sale_price_minor: 2000 }).select("id").single(), "event_product");
    const bar = must(await a.from("bars").insert({ event_id: event.id, name: "Barra QA" }).select("id").single(), "barra");
    s.barId = bar.id; save();
    must(await a.from("bar_stock").insert({ bar_id: bar.id, event_product_id: ep.id, quantity: 10 }), "bar_stock");
  }

  const items = must(await a.from("member_menu_items").insert([
    { organization_id: org.id, kind: "trago", name: "Fernet QA", price_minor: 2000, points_earned: 10, points_cost: null, product_id: product?.id ?? null, stock_units: 1 },
    { organization_id: org.id, kind: "combo", name: "Combo QA x2", price_minor: 5000, points_earned: 30, points_cost: null, product_id: null, stock_units: 1 },
    { organization_id: org.id, kind: "premio", name: "Trago gratis QA", price_minor: 0, points_earned: 0, points_cost: 40, product_id: null, stock_units: 1 },
  ]).select("id, kind"), "carta");
  const fernet = items.find((i) => i.kind === "trago").id;
  const premio = items.find((i) => i.kind === "premio").id;

  must(await a.from("member_levels").insert({ organization_id: org.id, name: "Plata QA", min_points: 100, discount_percent: 10, perk: "10% en la barra" }), "nivel");

  // Colectivo: 3 paradas; Ana sube en la 3; el colectivo esta en la 1.
  const route = must(await a.from("transfer_routes").insert({ event_id: event.id, name: "ZZ QA Colectivo", active: true }).select("id").single(), "ruta");
  s.routeId = route.id; save();
  const stops = must(await a.from("transfer_route_stops").insert([1, 2, 3].map((p) => ({ route_id: route.id, position: p, name: `Parada QA ${p}` }))).select("id, position"), "paradas");
  const stopBy = (p) => stops.find((x) => x.position === p).id;
  const tickets = must(await a.from("transfer_tickets").insert([
    { route_id: route.id, passenger_name: "Ana Qa", passenger_phone: "3400000001", manual_code: "QAQA01", stop_id: stopBy(3), status: "issued" },
    { route_id: route.id, passenger_name: "Otro Qa", manual_code: "QAQA02", stop_id: stopBy(2), status: "issued" },
  ]).select("id"), "pasajes");
  s.ticketIds = tickets.map((t) => t.id); save();
  const t0 = new Date(Date.now() - 20 * 60000).toISOString();
  must(await a.from("transfer_route_arrivals").insert({ route_id: route.id, stop_id: stopBy(1), arrived_at: t0 }), "llegada");
  must(await a.from("transfer_routes").update({ current_stop_id: stopBy(1), current_stop_at: t0 }).eq("id", route.id), "posicion");

  // Puntos de este mes (ranking) y del mes anterior (cierre por cron).
  const now = new Date();
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 15)).toISOString();
  must(await a.from("member_points_transactions").insert([
    { member_id: A, delta: 100, reason: "Pedido QA1", created_at: now.toISOString() },
    { member_id: B, delta: 60, reason: "Pedido QA2", created_at: now.toISOString() },
    { member_id: C, delta: 30, reason: "Pedido QA3", created_at: now.toISOString() },
    { member_id: A, delta: 200, reason: "Pedido QA-viejo", created_at: lastMonth },
    { member_id: B, delta: 150, reason: "Pedido QA-viejo2", created_at: new Date(new Date(lastMonth).getTime() + 3600000).toISOString() },
  ]), "puntos");
  must(await a.from("premium_members").update({ points_balance: 100 }).eq("id", A), "puntos A");
  console.log(`  listo (org ${org.id})`);

  console.log("== Seguridad del link y de la sesion ==");
  check("firma invalida -> 404", (await api(`${P}?s=xxx`)).status === 404);
  const g0 = (await api(`${P}${S(A)}`)).json;
  check("GET socio 200 con saldo y puntos numericos", g0?.member?.balanceMinor === 20000 && g0?.member?.pointsBalance === 100, JSON.stringify(g0?.member));
  check("sin sesion -> alerts.status login", g0?.alerts?.status === "login");
  check("socio sin email -> no_email", (await api(`/api/socio/${B}${S(B)}`)).json?.alerts?.status === "no_email");
  check("con sesion del email correcto -> ready", (await api(`${P}${S(A)}`, {}, cookieA)).json?.alerts?.status === "ready");
  check("sesion de otro email -> mismatch", (await api(`${P}${S(A)}`, {}, sessionCookie("otra@example.test"))).json?.alerts?.status === "mismatch");
  check("cookie adulterada -> login", (await api(`${P}${S(A)}`, {}, `${cookieA.slice(0, -3)}xyz`)).json?.alerts?.status === "login");

  console.log("== Nivel, puntos dobles y carta ==");
  check("carta con 3 items", g0?.menu?.length === 3);
  check("nivel: Ana (100 pts ganados) es Plata QA con 10%", g0?.level?.level?.name === "Plata QA" && g0?.level?.level?.discount_percent === 10, JSON.stringify(g0?.level));
  check("no hay puntos dobles todavia", (g0?.boosts ?? []).length === 0);

  console.log("== Pedidos ==");
  const noSession = await post(`${P}/pedido${S(A)}`, { kind: "consumo", items: [{ id: fernet, qty: 2 }], payment: "wallet", key: "qa-k0" });
  check("pagar con saldo SIN ingresar -> 401 login", noSession.status === 401 && noSession.json?.code === "login", JSON.stringify(noSession.json));
  const wrongEmail = await post(`${P}/pedido${S(A)}`, { kind: "consumo", items: [{ id: fernet, qty: 2 }], payment: "wallet", key: "qa-k0b" }, sessionCookie("otra@example.test"));
  check("pagar con saldo con OTRO email -> 403", wrongEmail.status === 403 && wrongEmail.json?.code === "mismatch", JSON.stringify(wrongEmail.json));
  const cash = await post(`${P}/pedido${S(A)}`, { kind: "consumo", items: [{ id: fernet, qty: 1 }], payment: "en_barra", key: "qa-k0c" });
  check("pagar al recibir NO exige sesion", cash.status === 200, JSON.stringify(cash.json));

  const o1 = await post(`${P}/pedido${S(A)}`, { kind: "consumo", items: [{ id: fernet, qty: 2 }], payment: "wallet", delivery: "Mesa: 7", key: "qa-k1" }, cookieA);
  check("pedido con saldo y sesion: 2 x 2000 con 10% = 3600", o1.status === 200 && o1.json?.totalMinor === 3600 && o1.json?.balanceMinor === 16400, JSON.stringify(o1.json));
  const o1b = await post(`${P}/pedido${S(A)}`, { kind: "consumo", items: [{ id: fernet, qty: 2 }], payment: "wallet", key: "qa-k1" }, cookieA);
  check("misma key -> no duplica", o1b.json?.alreadyExisted === true && o1b.json?.orderId === o1.json?.orderId);
  const big = await post(`${P}/pedido${S(A)}`, { kind: "consumo", items: [{ id: fernet, qty: 20 }], payment: "wallet", key: "qa-k2" }, cookieA);
  check("saldo insuficiente -> 400", big.status === 400 && /Saldo insuficiente/.test(big.json?.error ?? ""), JSON.stringify(big.json));
  const noPts = await post(`${P}/pedido${S(A)}`, { kind: "consumo", items: [{ id: premio, qty: 3 }], payment: "en_barra", key: "qa-k3" });
  check("premio sin puntos suficientes -> 400", noPts.status === 400 && /puntos/.test(noPts.json?.error ?? ""), JSON.stringify(noPts.json));

  // Boost activo: los puntos del pedido se duplican.
  must(await a.from("member_point_boosts").insert({ organization_id: org.id, name: "Doble QA", multiplier: 2, starts_at: new Date(Date.now() - 3600000).toISOString(), ends_at: new Date(Date.now() + 3600000).toISOString() }), "boost");
  const g1 = (await api(`${P}${S(A)}`, {}, cookieA)).json;
  check("puntos dobles vigentes visibles en la app", (g1?.boosts ?? []).length === 1 && g1.boosts[0].multiplier === 2);
  const o2 = await post(`${P}/pedido${S(A)}`, { kind: "consumo", items: [{ id: fernet, qty: 1 }], payment: "wallet", key: "qa-k4" }, cookieA);
  const o2row = must(await a.from("member_orders").select("points_earned, boost_multiplier, discount_percent").eq("id", o2.json.orderId).single(), "o2");
  check("el pedido con boost suma el doble (10 x2 = 20) y guarda el 10% de descuento", o2row.points_earned === 20 && Number(o2row.boost_multiplier) === 2 && o2row.discount_percent === 10, JSON.stringify(o2row));

  // Entregar (lo que hace el panel del organizador) y ver el stock y los puntos.
  const stockBefore = ep ? Number(must(await a.from("bar_stock").select("quantity").eq("bar_id", s.barId).single(), "stock").quantity) : null;
  const dl = await a.rpc("member_order_set_status", { p_order_id: o1.json.orderId, p_status: "delivered", p_organization_id: org.id, p_member_id: null });
  check("entregar pedido OK", !dl.error, dl.error?.message);
  if (ep) {
    const stockAfter = Number(must(await a.from("bar_stock").select("quantity").eq("bar_id", s.barId).single(), "stock2").quantity);
    check("al entregar 2 fernet baja el stock de la barra en 2", stockBefore - stockAfter === 2, `antes ${stockBefore} despues ${stockAfter}`);
  }
  const g2 = (await api(`${P}${S(A)}`, {}, cookieA)).json;
  check("los puntos suben al entregar (100 + 20)", g2?.member?.pointsBalance === 120, String(g2?.member?.pointsBalance));

  const pending = await post(`${P}/pedido${S(A)}`, { kind: "consumo", items: [{ id: fernet, qty: 1 }], payment: "wallet", key: "qa-k5" }, cookieA);
  const cancelled = await patch(`${P}/pedido${S(A)}`, { orderId: pending.json.orderId });
  check("el socio cancela un pedido pendiente", cancelled.status === 200);
  check("no se puede cancelar uno entregado", (await patch(`${P}/pedido${S(A)}`, { orderId: o1.json.orderId })).status === 400);

  console.log("== Mesas (desde la app del socio) ==");
  const m1 = await post(`${P}/pedido${S(A)}`, { kind: "mesa", tableId: table.id, payment: "wallet", key: "qa-m1" }, cookieA);
  check("reserva de mesa con saldo (3000)", m1.status === 200 && m1.json?.totalMinor === 3000, JSON.stringify(m1.json));
  const saleRows = must(await a.from("sales").select("id, status, channel, total_minor").eq("table_id", table.id), "ventas mesa");
  check("la reserva genera una venta del evento (channel mesa, confirmada)", saleRows.length === 1 && saleRows[0].channel === "mesa" && saleRows[0].status === "confirmed" && Number(saleRows[0].total_minor) === 3000, JSON.stringify(saleRows));
  check("no se puede reservar la misma mesa 2 veces", (await post(`${P}/pedido${S(A)}`, { kind: "mesa", tableId: table.id, payment: "en_barra", key: "qa-m2" })).status === 400);
  await patch(`${P}/pedido${S(A)}`, { orderId: m1.json.orderId });
  const saleAfter = must(await a.from("sales").select("status").eq("table_id", table.id), "venta cancelada");
  check("cancelar la reserva anula la venta y libera la mesa", saleAfter[0]?.status === "cancelled" && must(await a.from("bar_tables").select("status").eq("id", table.id).single(), "mesa").status === "available");

  console.log("== Ranking y premio mensual ==");
  const r1 = (await api(`${P}/ranking${S(A)}&period=month`)).json?.ranking;
  check("ranking habilitado con Ana primera", r1?.enabled === true && r1?.me?.position === 1, JSON.stringify(r1?.me));
  check("premios del mes visibles", r1?.prizes?.length === 2 && r1.prizes[0].prize === "Mesa VIP QA");
  const cron = await api("/api/cron/cierre-ranking", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  check("cron cierre-ranking OK y avisa", cron.status === 200 && cron.json?.notified >= 1, JSON.stringify(cron.json));
  const winners = must(await a.from("member_monthly_winners").select("position, member_id, notified_at").eq("organization_id", org.id).order("position"), "ganadores");
  check("ganadores del mes anterior: Ana #1 y Beto #2, avisados", winners.length === 2 && winners[0].member_id === A && winners[1].member_id === B && winners.every((w) => w.notified_at));
  check("un segundo cron no duplica ni vuelve a avisar", (await api("/api/cron/cierre-ranking", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })).json?.notified === 0);
  check("cron sin secreto -> 401", (await api("/api/cron/cierre-ranking")).status === 401);

  console.log("== Colectivo ==");
  const c1 = (await api(`${P}/colectivo${S(A)}`)).json?.routes?.[0];
  check("Ana ve su colectivo: faltan 2 paradas", c1?.state === "approaching" && c1?.stopsAway === 2, JSON.stringify(c1)?.slice(0, 200));
  const claim = await a.rpc("transfer_claim_notifications", { p_route_id: route.id });
  check("avisos del colectivo: nadie en la parada 1 ni la 2 todavia", !claim.error && claim.data.length === 0, JSON.stringify(claim));
  must(await a.from("transfer_routes").update({ current_stop_id: stopBy(2), current_stop_at: new Date().toISOString() }).eq("id", route.id), "avanza");
  const claim2 = await a.rpc("transfer_claim_notifications", { p_route_id: route.id });
  check("al llegar a la 2: 'Otro Qa' arrived y Ana approaching", claim2.data?.length === 2 && claim2.data.find((r) => r.passenger_name === "Otro Qa")?.kind === "arrived" && claim2.data.find((r) => r.passenger_name === "Ana Qa")?.kind === "approaching", JSON.stringify(claim2.data));
  check("reclamar de nuevo no duplica", (await a.rpc("transfer_claim_notifications", { p_route_id: route.id })).data?.length === 0);

  console.log("== Avisos al celular ==");
  const endpoint = `https://fcm.googleapis.com/fcm/send/qa-fake-${stamp}`;
  const sub = { endpoint, keys: { p256dh: "BQA-fake-p256dh-key", auth: "qa-fake-auth" } };
  check("activar avisos sin sesion -> 401", (await post(`${P}/push${S(A)}`, sub)).status === 401);
  check("activar avisos con otro email -> 403", (await post(`${P}/push${S(A)}`, sub, sessionCookie("otra@example.test"))).status === 403);
  check("endpoint no https -> 400", (await post(`${P}/push${S(A)}`, { endpoint: "http://x.test/a", keys: sub.keys }, cookieA)).status === 400);
  check("activar con sesion correcta -> 200", (await post(`${P}/push${S(A)}`, sub, cookieA)).status === 200);
  check("repetir no duplica", (await post(`${P}/push${S(A)}`, sub, cookieA)).status === 200 && must(await a.from("member_push_subscriptions").select("id").eq("endpoint", endpoint), "subs").length === 1);
  check("desactivar -> se borra", (await del(`${P}/push${S(A)}`, { endpoint })).status === 200 && must(await a.from("member_push_subscriptions").select("id").eq("endpoint", endpoint), "subs2").length === 0);

  console.log("== Recarga (sin Mercado Pago real) ==");
  check("sin aceptar 'no reembolsable' -> 400", (await post(`${P}/recarga${S(A)}`, { amount: 5000 })).status === 400);
  check("monto menor al minimo -> 400", (await post(`${P}/recarga${S(A)}`, { amount: 500, acceptedTerms: true })).status === 400);
  check("verificar una recarga inexistente -> 404", (await post(`${P}/recarga/verificar${S(A)}`, { topupId: "00000000-0000-4000-8000-000000000000" })).status === 404);

  console.log("== Pagina publica del evento y compra de mesas ==");
  const page = await api(`/e/${s.slug}`);
  check("la pagina del evento carga", page.status === 200 && page.text.includes("ZZ QA Fiesta"));
  check("muestra 'Reservá tu mesa' con las mesas disponibles", page.text.includes("Reserv") && page.text.includes("Mesa QA"), "sin la seccion de mesas");
  check("incluye los datos estructurados para Google", page.text.includes("application/ld+json") && page.text.includes('"@type":"Event"'));
  check("sin mesa elegida -> 400", (await post(`/api/e/${s.slug}/mesa/checkout`, { firstName: "A", lastName: "B", dni: "1", phone: "1" })).status === 400);
  // Con la cuenta de MP falsa la reserva se crea y el pago no puede iniciarse: tiene que liberar la mesa sola.
  const mesaTry = await post(`/api/e/${s.slug}/mesa/checkout`, { tableId: table2.id, firstName: "Qa", lastName: "Comprador", dni: "30111222", phone: "3400000099" });
  check("si el pago no puede iniciarse responde 503 (no cuelga)", mesaTry.status === 503 || mesaTry.status === 409, `status ${mesaTry.status} ${JSON.stringify(mesaTry.json)}`);
  const tableState = must(await a.from("bar_tables").select("status").eq("id", table2.id).single(), "mesa2").status;
  check("y la mesa NO queda bloqueada (vuelve a disponible)", tableState === "available", `estado ${tableState}`);

  console.log("== Asistencia y datos del panel ==");
  const c1r = await a.rpc("member_checkin_award", { p_member_id: A, p_event_id: event.id });
  const c2r = await a.rpc("member_checkin_award", { p_member_id: A, p_event_id: event.id });
  check("asistencia suma 20 una sola vez", c1r.data?.[0]?.points_awarded === 20 && c2r.data?.[0]?.points_awarded === 0);
  const metrics = await a.rpc("member_metrics", { p_organization_id: org.id, p_since: new Date(Date.now() - 30 * 86400000).toISOString() });
  check("metricas del panel", !metrics.error && metrics.data?.members?.total === 3, metrics.error?.message);
  check("consulta de niveles del panel", !(await a.from("member_levels").select("id, name, min_points, discount_percent, perk").eq("organization_id", org.id).is("deleted_at", null)).error);
  check("consulta de carta con vinculo a stock", !(await a.from("member_menu_items").select("id, kind, product_id, stock_units").eq("organization_id", org.id)).error);

  console.log(`\nRESULTADO: ${pass} OK, ${fail} con falla`);
  if (fail > 0) process.exitCode = 1;
}

try {
  if (process.argv[2] === "setup") await setup();
  else if (process.argv[2] === "cleanup") await cleanup();
  else console.log("uso: QA_CONFIRM=si node scripts/qa/socio-e2e.mjs setup|cleanup");
} catch (error) {
  console.log("ERROR EN EL SCRIPT:", error.message);
  console.log("Corre 'cleanup' para borrar lo que haya quedado.");
  process.exitCode = 1;
}
