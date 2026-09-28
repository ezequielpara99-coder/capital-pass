// QA de Capital Sales Agent contra la base REAL de .env.local y un servidor
// de produccion en marcha (por defecto http://localhost:3001). NO usa
// verifyAdmin real (no hay forma de loguearse desde un script), asi que
// prueba directo las funciones puras y las tablas/indices de la base --
// deja a mano la verificacion visual de las pantallas.
//
//   QA_CONFIRM=si node scripts/qa/sales-agent-e2e.mjs setup
//   QA_CONFIRM=si node scripts/qa/sales-agent-e2e.mjs cleanup
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.env.QA_CONFIRM !== "si") {
  console.log("Crea datos 'ZZ QA Sales Agent' en la base real y los borra al final. Correlo con QA_CONFIRM=si.");
  process.exit(1);
}

const PROJECT = process.cwd();
const STATE = join(tmpdir(), "capital-pass-qa-sales-agent.json");
const require = createRequire(join(PROJECT, "package.json"));
const { createClient } = require("@supabase/supabase-js");
for (const line of readFileSync(join(PROJECT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { if (ok) { pass++; console.log(`  OK    ${name}`); } else { fail++; console.log(`  FALLA ${name} ${extra}`); } };

async function cleanup() {
  if (!existsSync(STATE)) return console.log("Sin estado guardado.");
  const s = JSON.parse(readFileSync(STATE, "utf8"));
  const remove = async (table, column, values) => {
    if (!values?.length) return;
    const r = await a.from(table).delete().in(column, values);
    if (r.error) console.log(`  (limpieza ${table}: ${r.error.message})`);
  };
  await remove("prospect_conversions", "prospect_id", s.prospectIds);
  await remove("prospect_interactions", "prospect_id", s.prospectIds);
  await remove("prospect_followups", "prospect_id", s.prospectIds);
  await remove("prospect_messages", "prospect_id", s.prospectIds);
  await remove("prospect_opportunities", "prospect_id", s.prospectIds);
  await remove("prospect_events", "prospect_id", s.prospectIds);
  await remove("prospects", "id", s.prospectIds);
  await remove("prospect_campaigns", "id", [s.campaignId].filter(Boolean));
  const left = await a.from("prospects").select("id").ilike("name", "ZZ QA%");
  console.log(`Limpieza: prospectos ZZ QA restantes=${left.data?.length}`);
  writeFileSync(STATE, "{}");
}

async function setup() {
  const stamp = Date.now();
  const s = { prospectIds: [] };
  writeFileSync(STATE, JSON.stringify(s));
  const save = () => writeFileSync(STATE, JSON.stringify(s));

  console.log("== Campaña ==");
  const campaign = await a.from("prospect_campaigns").insert({ name: `ZZ QA Campaña ${stamp}`, city: "Rosario", categories: ["boliche"], min_score: 50 }).select("id").single();
  check("crea campaña", !campaign.error, campaign.error?.message);
  s.campaignId = campaign.data?.id; save();

  console.log("== Prospectos y duplicados ==");
  const p1 = await a.from("prospects").insert({ name: `ZZ QA Club Uno ${stamp}`, instagram_username: `zzqaclub${stamp}`, website_domain: `zzqaclub${stamp}.test`, phone_digits: `54934${stamp}`.slice(0, 13), email_norm: `zzqa${stamp}@example.test`, campaign_id: s.campaignId }).select("id").single();
  check("crea prospecto 1", !p1.error, p1.error?.message);
  s.prospectIds.push(p1.data.id); save();

  const dup = await a.from("prospects").insert({ name: "Otro nombre", instagram_username: `ZZQACLUB${stamp}` });
  check("rechaza instagram duplicado (mayúsculas incluidas)", Boolean(dup.error), JSON.stringify(dup.error));

  const p2 = await a.from("prospects").insert({ name: `ZZ QA Club Dos ${stamp}`, city: "Rosario", category: "boliche", followers: 12000, events_per_month: 4 }).select("id").single();
  check("crea prospecto 2 (sin datos de contacto que choquen)", !p2.error, p2.error?.message);
  s.prospectIds.push(p2.data.id); save();

  // El puntaje en si (formula, motivos, deteccion de ticketing, duplicados,
  // mensajes) ya lo cubren los tests unitarios de "npm test" (20 pruebas en
  // tests/sales-agent.test.ts) -- ese archivo importa "server-only" en
  // investigate.ts, que Next resuelve de forma especial y un script plano
  // fuera de Next no puede, asi que aca solo se prueba que la base guarda y
  // relee bien un puntaje ya calculado (jsonb de motivos incluido).
  console.log("== Guardar y releer un puntaje (jsonb de motivos) ==");
  const reasons = ["Eventos frecuentes", "Vende entradas online"];
  await a.from("prospects").update({ score: 63, potential: "alto", score_reasons: reasons, score_missing: ["No se pudo confirmar el alcance."] }).eq("id", p2.data.id);
  const saved = await a.from("prospects").select("score, potential, score_reasons, score_missing").eq("id", p2.data.id).single();
  check("el puntaje se guarda y se puede releer tal cual", saved.data?.score === 63 && saved.data?.potential === "alto" && JSON.stringify(saved.data?.score_reasons) === JSON.stringify(reasons), JSON.stringify(saved.data));

  console.log("== Oportunidades, mensajes, seguimiento, interacción (tablas reales) ==");
  const opp = await a.from("prospect_opportunities").insert({ prospect_id: p1.data.id, type: "sin_rrpp_visible", description: "Tiene venta online pero no muestra RRPP.", priority: "media" }).select("id").single();
  check("guarda una oportunidad", !opp.error, opp.error?.message);

  const msg = await a.from("prospect_messages").insert({ prospect_id: p1.data.id, campaign_id: s.campaignId, channel: "whatsapp", style: "natural", message: "Hola! ...", status: "enviado", sent_at: new Date().toISOString() }).select("id").single();
  check("guarda un mensaje enviado", !msg.error, msg.error?.message);

  const followup = await a.from("prospect_followups").insert({ prospect_id: p1.data.id, message_id: msg.data?.id, scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString() }).select("id").single();
  check("programa un seguimiento", !followup.error, followup.error?.message);

  const interaction = await a.from("prospect_interactions").insert({ prospect_id: p1.data.id, type: "respuesta", content: "Hola! Sí, contame un poco más." }).select("id").single();
  check("guarda una respuesta pegada a mano", !interaction.error, interaction.error?.message);

  console.log("== Conversión a cliente ==");
  const conv = await a.from("prospect_conversions").insert({ prospect_id: p1.data.id, campaign_id: s.campaignId, plan_label: "Avanzado", monthly_value_minor: 15000000 }).select("id").single();
  check("registra la conversión", !conv.error, conv.error?.message);
  await a.from("prospects").update({ status: "cliente" }).eq("id", p1.data.id);

  console.log(`\nRESULTADO: ${pass} OK, ${fail} con falla`);
  console.log("(El fetch seguro de 'Investigar', SSRF incluido, corre solo dentro de Next -- se prueba a mano en el paso 4 de abajo.)");
  console.log("Revisión visual pendiente (a mano): /admin/sales-agent, /admin/sales-agent/prospectos, /admin/sales-agent/prospectos/" + p1.data.id);
  if (fail > 0) process.exitCode = 1;
}

try {
  if (process.argv[2] === "setup") await setup();
  else if (process.argv[2] === "cleanup") await cleanup();
  else console.log("uso: QA_CONFIRM=si node scripts/qa/sales-agent-e2e.mjs setup|cleanup");
} catch (error) {
  console.log("ERROR:", error.message);
  console.log("Corré cleanup para borrar lo que haya quedado.");
  process.exitCode = 1;
}
