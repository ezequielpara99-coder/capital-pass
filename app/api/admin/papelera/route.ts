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
  { table: "quote_payments", type: "Cobro", select: "id, amount_minor, paid_at, quote_id, deleted_at", label: (r: Record<string, unknown>) => `Cobro $ ${Number(r.amount_minor).toLocaleString("es-AR")} · ${r.paid_at}${r.quoteLabel ? ` · ${r.quoteLabel}` : ""}` },
  { table: "monthly_packs", type: "Pack mensual", select: "id, client_name, deleted_at", label: (r: Record<string, unknown>) => String(r.client_name) },
  { table: "premium_members", type: "Socio premium", select: "id, first_name, last_name, member_code, deleted_at", label: (r: Record<string, unknown>) => `${r.first_name} ${r.last_name} · ${r.member_code}` },
  { table: "blacklist_entries", type: "Lista negra", select: "id, dni, full_name, deleted_at", label: (r: Record<string, unknown>) => `${r.full_name || "Sin nombre"} · DNI ${r.dni}` },
  { table: "member_menu_items", type: "Carta de socios", select: "id, name, kind, deleted_at", label: (r: Record<string, unknown>) => `${r.name} · ${r.kind}` },
  { table: "prospects", type: "Prospecto (Sales Agent)", select: "id, name, city, deleted_at", label: (r: Record<string, unknown>) => `${r.name}${r.city ? ` · ${r.city}` : ""}` },
  { table: "prospect_campaigns", type: "Campaña (Sales Agent)", select: "id, name, deleted_at", label: (r: Record<string, unknown>) => String(r.name) },
  { table: "member_levels", type: "Nivel de socio", select: "id, name, min_points, deleted_at", label: (r: Record<string, unknown>) => `${r.name} · desde ${r.min_points} pts` },
  { table: "member_point_boosts", type: "Puntos dobles", select: "id, name, multiplier, deleted_at", label: (r: Record<string, unknown>) => `${r.name} · x${r.multiplier}` },
  { table: "organization_purchases", type: "Compra", select: "id, description, total_minor, deleted_at", label: (r: Record<string, unknown>) => `${r.description} · $ ${Number(r.total_minor).toLocaleString("es-AR")}` },
  { table: "transfer_routes", type: "Colectivo", select: "id, name, deleted_at", label: (r: Record<string, unknown>) => String(r.name) },
] as const;

// GET: todo lo borrado en los ultimos 90 dias, de todas las tablas juntas.
export async function GET() {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const admin = createAdminClient();
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

    const LIMIT = 50;
    const results = await Promise.all(
      TABLES.map(async (t) => {
        const [{ data, error }, { count }] = await Promise.all([
          admin.from(t.table).select(t.select).not("deleted_at", "is", null).gte("deleted_at", since).order("deleted_at", { ascending: false }).limit(LIMIT),
          admin.from(t.table).select("id", { count: "exact", head: true }).not("deleted_at", "is", null).gte("deleted_at", since),
        ]);
        if (error) {
          if (isMissingTable(error)) return { missing: true as const, truncated: 0, rows: [], type: t.type, tableName: t.table, labelFn: t.label };
          console.error(`PAPELERA ${t.table}:`, error);
          return { missing: false as const, truncated: 0, rows: [], type: t.type, tableName: t.table, labelFn: t.label };
        }
        const rows = (data ?? []) as unknown as Record<string, unknown>[];
        return {
          missing: false as const,
          // Si hay mas de las 50 mostradas, se avisa en vez de esconderlas
          // sin ningun rastro -- antes un borrado masivo de una tabla dejaba
          // el resto invisible e irrecuperable desde la papelera.
          truncated: Math.max(0, (count ?? rows.length) - rows.length),
          rows,
          type: t.type,
          tableName: t.table,
          labelFn: t.label,
        };
      })
    );

    if (results.every((r) => r.missing)) {
      return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (papelera)." }, { status: 503 });
    }

    // "Cobro" no mostraba a que presupuesto pertenecia -- si el presupuesto
    // tambien esta borrado, quedaba totalmente intrazable desde la papelera.
    const paymentQuoteIds = [
      ...new Set(
        results
          .filter((r): r is Extract<typeof r, { missing: false }> => !r.missing && r.tableName === "quote_payments")
          .flatMap((r) => r.rows.map((row) => row.quote_id).filter(Boolean) as string[])
      ),
    ];
    const quoteLabelById = new Map<string, string>();
    if (paymentQuoteIds.length > 0) {
      const { data: quotesForPayments } = await admin.from("quotes").select("id, number, client_name").in("id", paymentQuoteIds);
      for (const q of quotesForPayments ?? []) {
        quoteLabelById.set(q.id as string, `${q.client_name} · ${quoteCode(Number(q.number))}`);
      }
    }

    const items = results
      .filter((r): r is Extract<typeof r, { missing: false }> => !r.missing)
      .flatMap((r) =>
        r.rows.map((row) => ({
          table: r.tableName,
          type: r.type,
          id: String(row.id),
          label: r.labelFn({ ...row, quoteLabel: row.quote_id ? quoteLabelById.get(row.quote_id as string) : undefined }),
          deletedAt: String(row.deleted_at),
        }))
      )
      .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

    const truncatedByType = Object.fromEntries(
      results.filter((r): r is Extract<typeof r, { missing: false }> => !r.missing && r.truncated > 0).map((r) => [r.type, r.truncated])
    );

    return NextResponse.json({ ok: true, items, truncatedByType });
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
