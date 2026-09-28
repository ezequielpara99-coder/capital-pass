import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "../../../../../../../lib/quotes/auth";
import { createAdminClient } from "../../../../../../../lib/supabase/admin";
import { investigateProspectById, PROSPECT_FIELDS } from "../../../../../../../lib/sales-agent/investigate-prospect";
import { checkRateLimit } from "../../../../../../../lib/http/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

// POST { url? }: trae la pagina publica indicada (o la web/instagram ya
// cargados del prospecto), detecta el sistema de venta, herramientas
// externas y oportunidades, y recalcula el puntaje. Un solo fetch puntual,
// no repetido -- el admin decide cuando volver a investigar.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    if (!(await checkRateLimit(`sales-agent-investigar:${verification.userId}`, 20, 60))) {
      return NextResponse.json({ error: "Demasiados intentos. Esperá un minuto." }, { status: 429 });
    }

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Prospecto inválido." }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const admin = createAdminClient();
    const outcome = await investigateProspectById(admin, id, body.url ? String(body.url).trim() : null);

    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.error.includes("No se encontró") ? 404 : outcome.error.includes("no tiene") || outcome.error.includes("No tiene") ? 400 : 502 });

    const [{ data: prospect }, { data: opportunities }] = await Promise.all([
      admin.from("prospects").select(PROSPECT_FIELDS).eq("id", id).maybeSingle(),
      admin.from("prospect_opportunities").select("id, type, description, priority").eq("prospect_id", id),
    ]);

    return NextResponse.json({ ok: true, prospect, opportunities: opportunities ?? [], investigatedUrl: outcome.investigatedUrl });
  } catch (error) {
    console.error("SALES AGENT INVESTIGAR:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
