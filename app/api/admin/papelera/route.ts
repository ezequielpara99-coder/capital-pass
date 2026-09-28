import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { isMissingTable, verifyAdmin } from "../../../../lib/quotes/auth";
import { quoteCode } from "../../../../lib/quotes/totals";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAYS = 90;

// Cada tabla con soft-delete: como se llama en pantalla, que columnas
// alcanzan para reconocer la fila, y como armar su titulo.
const TABLES = [
  { table: "quotes", type: "Presupuesto", select: "id, number, client_name, deleted_at", label: (r: Record<string, unknown>) => `${r.client_name} · ${quoteCode(Number(r.number))}` },
  { table: "quote_clients", type: "Cliente", select: "id, name, deleted_at", label: (r: Record<string, unknown>) => String(r.name) },
  { table: "quote_catalog", type: "Catálogo", select: "id, description, deleted_at", label: (r: Record<string, unknown>) => String(r.description) },
  { table: "quote_packages", type: "Paquete", select: "id, name, deleted_at", label: (r: Record<string, unknown>) => String(r.name) },
  { table: "expenses", type: "Gasto", select: "id, description, amount_minor, deleted_at", label: (r: Record<string, unknown>) => `${r.description} · $ ${Number(r.amount_minor).toLocaleString("es-AR")}` },
  { table: "quote_payments", type: "Cobro", select: "id, amount_minor, paid_at, deleted_at", label: (r: Record<string, unknown>) => `Cobro $ ${Number(r.amount_minor).toLocaleString("es-AR")} · ${r.paid_at}` },
  { table: "monthly_packs", type: "Pack mensual", select: "id, client_name, deleted_at", label: (r: Record<string, unknown>) => String(r.client_name) },
  { table: "premium_members", type: "Socio premium", select: "id, first_name, last_name, member_code, deleted_at", label: (r: Record<string, unknown>) => `${r.first_name} ${r.last_name} · ${r.member_code}` },
  { table: "blacklist_entries", type: "Lista negra", select: "id, dni, full_name, deleted_at", label: (r: Record<string, unknown>) => `${r.full_name || "Sin nombre"} · DNI ${r.dni}` },
  { table: "transfer_routes", type: "Colectivo", select: "id, name, deleted_at", label: (r: Record<string, unknown>) => String(r.name) },
] as const;

// GET: todo lo borrado en los ultimos 90 dias, de todas las tablas juntas.
export async function GET() {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const admin = createAdminClient();
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

    const results = await Promise.all(
      TABLES.map(async (t) => {
        const { data, error } = await admin.from(t.table).select(t.select).not("deleted_at", "is", null).gte("deleted_at", since).order("deleted_at", { ascending: false }).limit(50);
        if (error) {
          if (isMissingTable(error)) return { missing: true as const, items: [] };
          console.error(`PAPELERA ${t.table}:`, error);
          return { missing: false as const, items: [] };
        }
        return {
          missing: false as const,
          items: ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
            table: t.table,
            type: t.type,
            id: String(row.id),
            label: t.label(row),
            deletedAt: String(row.deleted_at),
          })),
        };
      })
    );

    if (results.every((r) => r.missing)) {
      return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (papelera)." }, { status: 503 });
    }

    const items = results.flatMap((r) => r.items).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error("PAPELERA GET:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// POST: restaura una fila borrada (body: { table, id }).
export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const table = String(body.table ?? "");
    const id = String(body.id ?? "");
    if (!UUID.test(id) || !TABLES.some((t) => t.table === table)) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin.from(table).update({ deleted_at: null }).eq("id", id).not("deleted_at", "is", null).select("id").maybeSingle();

    if (error) {
      // Ej: restaurar una factura de pack mensual cuando ya se genero otra
      // para el mismo periodo (choca con el indice unico parcial).
      if (error.code === "23505") return NextResponse.json({ error: "No se puede restaurar: ya existe otro registro equivalente." }, { status: 409 });
      console.error("PAPELERA POST:", error);
      return NextResponse.json({ error: "No se pudo restaurar." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró lo que querías restaurar." }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PAPELERA POST:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
