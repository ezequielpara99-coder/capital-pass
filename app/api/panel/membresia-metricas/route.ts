import { NextRequest, NextResponse } from "next/server";
import { isMissingTable, resolveOrganizer } from "../../../../lib/panel/organizer";
import { periodStart } from "../../../../lib/panel/period";

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
