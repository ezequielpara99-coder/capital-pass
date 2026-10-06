// Backup de la base de PRODUCCION (solo lectura) a un archivo comprimido.
//
//   node scripts/backup/exportar-base.mjs
//
// Lee .env.local (NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY), baja todas
// las tablas del esquema public por la API REST y la lista de usuarios de
// Auth, y escribe backups/capital-pass-base-AAAA-MM-DD-HHMM.json.gz (la
// carpeta backups/ esta en .gitignore: tiene datos personales).
//
// No escribe nada en la base. Las columnas con tokens o secretos (ej. el
// access token de Mercado Pago de cada organizador) se reemplazan por
// "[omitido]": si se restaura, el organizador vuelve a conectar Mercado Pago.
// Despues Claude sube el archivo a Google Drive, carpeta
// "Capital Pass – Backups" (ver CLAUDE.md).
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const PROJECT = process.cwd();
const env = Object.fromEntries(
  readFileSync(join(PROJECT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.trim().replace(/^["']|["']$/g, "")])
);

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SECRET_KEY;
if (!URL_BASE || !KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local.");
  process.exit(1);
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// Tablas que no vale la pena guardar (se regeneran solas).
const SKIP_TABLES = new Set(["rate_limit_buckets"]);
const SECRET_COLUMN = /token|secret|password|auth_key|p256dh/i;
const PAGE = 1000;

async function listTables() {
  const res = await fetch(`${URL_BASE}/rest/v1/`, { headers: { ...headers, Accept: "application/openapi+json" } });
  if (!res.ok) throw new Error(`No se pudo leer el esquema (${res.status}).`);
  const spec = await res.json();
  return Object.keys(spec.definitions ?? {}).filter((name) => !SKIP_TABLES.has(name)).sort();
}

async function dumpTable(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*`, {
      headers: { ...headers, Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items" },
    });
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
    const page = await res.json();
    for (const row of page) {
      for (const column of Object.keys(row)) {
        if (SECRET_COLUMN.test(column) && row[column] != null) row[column] = "[omitido]";
      }
      rows.push(row);
    }
    if (page.length < PAGE) return rows;
  }
}

async function dumpAuthUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${URL_BASE}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers });
    if (!res.ok) throw new Error(`auth users: ${res.status}`);
    const body = await res.json();
    const list = body.users ?? [];
    for (const u of list) {
      users.push({
        id: u.id, email: u.email, phone: u.phone, created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at, email_confirmed_at: u.email_confirmed_at,
        user_metadata: u.user_metadata, app_metadata: u.app_metadata,
      });
    }
    if (list.length < 1000) return users;
  }
}

const backup = { generado: new Date().toISOString(), proyecto: URL_BASE, tablas: {}, auth_users: [], vistas_con_error: {} };
const tables = await listTables();
for (const table of tables) {
  try {
    backup.tablas[table] = await dumpTable(table);
  } catch (error) {
    // Vistas o funciones expuestas que no se pueden listar: se anotan y sigue.
    backup.vistas_con_error[table] = String(error.message ?? error).slice(0, 300);
  }
}
backup.auth_users = await dumpAuthUsers();

const stamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
const dir = join(PROJECT, "backups");
mkdirSync(dir, { recursive: true });
const file = join(dir, `capital-pass-base-${stamp}.json.gz`);
const gz = gzipSync(JSON.stringify(backup));
writeFileSync(file, gz);

const totalRows = Object.values(backup.tablas).reduce((sum, rows) => sum + rows.length, 0);
console.log(JSON.stringify({
  archivo: file,
  tamano_kb: Math.round(gz.length / 1024),
  tablas: Object.keys(backup.tablas).length,
  filas: totalRows,
  usuarios: backup.auth_users.length,
  con_error: Object.keys(backup.vistas_con_error),
}, null, 2));
