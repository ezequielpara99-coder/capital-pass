import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { isMissingTable, verifyAdmin } from "../../../../../../lib/quotes/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET: historial de precios de un item del catalogo (?catalogId=).
export async function GET(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const catalogId = request.nextUrl.searchParams.get("catalogId") ?? "";
    if (!UUID.test(catalogId)) return NextResponse.json({ error: "Item inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("quote_catalog_price_history")
      .select("id, unit_price_minor, changed_at")
      .eq("catalog_id", catalogId)
      .order("changed_at", { ascending: false });

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (historial de precios)." }, { status: 503 });
      console.error("CATALOGO HISTORIAL GET:", error);
      return NextResponse.json({ error: "No se pudo cargar el historial." }, { status: 500 });
    }

    const history = (data ?? []).map((row) => ({ ...row, unit_price_minor: Number(row.unit_price_minor) }));
    return NextResponse.json({ ok: true, history });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
