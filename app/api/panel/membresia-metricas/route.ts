import { NextRequest, NextResponse } from "next/server";
import { isMissingTable, resolveOrganizer } from "../../../../lib/panel/organizer";

// Arranque del periodo pedido, en hora de Argentina (UTC-3, sin horario de verano).
function periodStart(period: string) {
  const now = new Date();
  const ar = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  if (period === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (period === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (period === "all") return new Date("2000-01-01T00:00:00Z");
  // "month": desde el dia 1 del mes en curso a las 00:00 de Argentina.
  return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), 1, 3, 0, 0));
}

// GET: panel de datos de la membresia (quien compra, quien tiene mas puntos, destacados).
export async function GET(request: NextRequest) {
  try {
    const caller = await resolveOrganizer({ requirePremium: true });
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const period = request.nextUrl.searchParams.get("period") ?? "month";
    const since = periodStart(period);

    const { data, error } = await caller.admin.rpc("member_metrics", {
      p_organization_id: caller.organizationId,
      p_since: since.toISOString(),
    });

    if (error) {
      if (isMissingTable(error) || /member_metrics/i.test(error.message ?? "")) {
        return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos de la app del socio (20260982)." }, { status: 503 });
      }
      console.error("MEMBRESIA METRICAS:", error);
      return NextResponse.json({ error: "No se pudieron cargar los datos." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, period, since: since.toISOString(), metrics: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
