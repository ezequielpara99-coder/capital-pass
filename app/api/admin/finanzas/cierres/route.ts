import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { isMissingTable, verifyAdmin } from "../../../../../lib/quotes/auth";
import { computeFinanzasSummary } from "../../../../../lib/finanzas/summary";

const PERIOD = /^\d{4}-\d{2}-01$/;

function lastDayOfMonth(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function previousMonthPeriod() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // mes anterior: restar 1 al mes actual (0-index ya lo hace)
  const date = new Date(Date.UTC(year, month - 1, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// GET: lista los cierres ya hechos, mas nuevos primero.
export async function GET() {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const admin = createAdminClient();
    const { data, error } = await admin.from("monthly_closures").select("*").order("period", { ascending: false });

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (cierre mensual)." }, { status: 503 });
      console.error("CIERRES GET:", error);
      return NextResponse.json({ error: "No se pudieron cargar los cierres." }, { status: 500 });
    }

    const closures = (data ?? []).map((row) => ({
      id: row.id,
      period: row.period,
      presupuestado: Number(row.presupuestado_minor),
      facturado: Number(row.facturado_minor),
      cobrado: Number(row.cobrado_minor),
      pendiente: Number(row.pendiente_minor),
      gastos: Number(row.gastos_minor),
      resultado: Number(row.resultado_minor),
      closedAt: row.closed_at,
    }));

    return NextResponse.json({ ok: true, closures, suggestedPeriod: previousMonthPeriod() });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// POST: cierra un mes (body: { period: "YYYY-MM-01" }, default el mes
// anterior). Cuenta lo creado/cobrado/gastado dentro de ese mes exacto y
// deja el numero fijo -- no se puede cerrar el mismo mes dos veces.
export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json().catch(() => ({}));
    const period = PERIOD.test(body.period) ? body.period : previousMonthPeriod();
    const to = lastDayOfMonth(period);

    const admin = createAdminClient();
    const result = await computeFinanzasSummary(admin, { from: period, to });
    if ("error" in result) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (finanzas)." }, { status: 503 });

    const { summary } = result;
    const { data, error } = await admin
      .from("monthly_closures")
      .insert({
        period,
        presupuestado_minor: summary.presupuestado,
        facturado_minor: summary.facturado,
        cobrado_minor: summary.cobrado,
        pendiente_minor: summary.pendiente,
        gastos_minor: summary.gastos,
        resultado_minor: summary.resultado,
        closed_by: verification.userId,
      })
      .select("*")
      .single();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (cierre mensual)." }, { status: 503 });
      if (error.code === "23505") return NextResponse.json({ error: "Ese mes ya está cerrado. Reabrilo primero si necesitás corregirlo." }, { status: 409 });
      console.error("CIERRES POST:", error);
      return NextResponse.json({ error: "No se pudo cerrar el mes." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      closure: {
        id: data.id,
        period: data.period,
        presupuestado: Number(data.presupuestado_minor),
        facturado: Number(data.facturado_minor),
        cobrado: Number(data.cobrado_minor),
        pendiente: Number(data.pendiente_minor),
        gastos: Number(data.gastos_minor),
        resultado: Number(data.resultado_minor),
        closedAt: data.closed_at,
      },
    });
  } catch (error) {
    console.error("CIERRES POST:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE: reabre un mes cerrado por error (?id=).
export async function DELETE(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const id = request.nextUrl.searchParams.get("id") ?? "";
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID.test(id)) return NextResponse.json({ error: "Cierre inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from("monthly_closures").delete().eq("id", id);

    if (error) {
      console.error("CIERRES DELETE:", error);
      return NextResponse.json({ error: "No se pudo reabrir el mes." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
