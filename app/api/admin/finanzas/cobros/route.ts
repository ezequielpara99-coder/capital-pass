import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { verifyAdmin } from "../../../../../lib/quotes/auth";
import { computePendingCollections } from "../../../../../lib/finanzas/pending";

// Centro de cobros: cada presupuesto facturado (a_pagar/aceptado) que
// todavia tiene saldo pendiente, para poder reclamarlo. No es un estado
// nuevo -- es la misma cuenta que ya usa el dashboard de /admin/finanzas,
// pero desglosada presupuesto por presupuesto en vez de sumada.
export async function GET() {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const admin = createAdminClient();
    const pending = await computePendingCollections(admin);

    if ("error" in pending) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (finanzas)." }, { status: 503 });

    return NextResponse.json({ ok: true, pending });
  } catch (error) {
    console.error("COBROS GET:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
