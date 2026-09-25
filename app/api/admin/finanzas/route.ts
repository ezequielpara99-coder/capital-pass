import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyAdmin } from "../../../../lib/quotes/auth";
import { computeFinanzasSummary } from "../../../../lib/finanzas/summary";

// Resumen de finanzas: presupuestado / facturado / cobrado / pendiente /
// gastos / resultado, sobre lo que ya existe en quotes + lo nuevo
// (quote_payments, expenses). No inventa un estado nuevo: "facturado" es
// a_pagar/aceptado (presupuesto confirmado), "cobrado" es lo que ya se
// registró como pago contra un presupuesto facturado. Con rango de fechas,
// cuenta lo CREADO/COBRADO/GASTADO en ese rango (mismo criterio que usa el
// cierre mensual, via computeFinanzasSummary).
export async function GET(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const admin = createAdminClient();
    const result = await computeFinanzasSummary(admin, { from, to });

    if ("error" in result) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (finanzas)." }, { status: 503 });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("FINANZAS GET:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
