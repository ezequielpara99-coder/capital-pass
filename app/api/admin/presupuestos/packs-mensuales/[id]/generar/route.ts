import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../../../lib/supabase/admin";
import { isMissingTable, QUOTE_FIELDS, verifyAdmin } from "../../../../../../../lib/quotes/auth";

type Context = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// UTC (no hora local del servidor) -- mismo criterio que previousMonthPeriod
// en /api/admin/finanzas/cierres, para que "el mes actual" sea siempre el
// mismo mes sin importar la zona horaria del proceso.
function currentPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// POST: genera (o devuelve, si ya existe) la factura del mes actual para un
// pack mensual. Idempotente por (monthly_pack_id, pack_period) -- un doble
// click no duplica la factura, devuelve la que ya se habia generado.
export async function POST(_request: NextRequest, context: Context) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Pack inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { data: pack, error: packError } = await admin.from("monthly_packs").select("*").eq("id", id).maybeSingle();

    if (packError) {
      if (isMissingTable(packError)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (packs mensuales)." }, { status: 503 });
      console.error("GENERAR PACK GET:", packError);
      return NextResponse.json({ error: "No se pudo cargar el pack." }, { status: 500 });
    }
    if (!pack) return NextResponse.json({ error: "No se encontró el pack." }, { status: 404 });
    if (!pack.active) return NextResponse.json({ error: "Este pack está desactivado." }, { status: 400 });

    const period = currentPeriod();
    const packPrice = Number(pack.package_price_minor);

    const { data: existing } = await admin.from("quotes").select(QUOTE_FIELDS).eq("monthly_pack_id", id).eq("pack_period", period).maybeSingle();
    if (existing) return NextResponse.json({ ok: true, quote: existing, alreadyExisted: true });

    const { data: quote, error: insertError } = await admin
      .from("quotes")
      .insert({
        kind: pack.kind,
        status: "a_pagar",
        client_name: pack.client_name,
        client_contact: pack.client_contact,
        client_phone: pack.client_phone,
        client_email: pack.client_email,
        title: pack.kind === "rental" ? `Pack mensual · ${period.slice(0, 7)}` : null,
        event_name: pack.kind === "diseno" ? `Pack mensual · ${period.slice(0, 7)}` : null,
        modality: "mensual",
        items: [{ description: pack.description || "Pack mensual", quantity: 1, unit: "mes", unit_price_minor: packPrice }],
        price_mode: "package",
        package_price_minor: packPrice,
        notes: pack.notes,
        monthly_pack_id: id,
        pack_period: period,
        created_by: verification.userId,
      })
      .select(QUOTE_FIELDS)
      .single();

    if (insertError) {
      // Carrera rara (doble click a la vez): el indice unico ya frenó el
      // duplicado -- se devuelve la que quedó creada, no un error.
      if (insertError.code === "23505") {
        const { data: raced } = await admin.from("quotes").select(QUOTE_FIELDS).eq("monthly_pack_id", id).eq("pack_period", period).maybeSingle();
        if (raced) return NextResponse.json({ ok: true, quote: raced, alreadyExisted: true });
      }
      console.error("GENERAR PACK INSERT:", insertError);
      return NextResponse.json({ error: "No se pudo generar la factura del mes." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, quote, alreadyExisted: false });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
