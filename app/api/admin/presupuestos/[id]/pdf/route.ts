import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { isMissingTable, QUOTE_FIELDS, verifyAdmin } from "../../../../../../lib/quotes/auth";
import { buildQuotePdf, QuoteForPdf } from "../../../../../../lib/quotes/pdf";
import {
  normalizeDiscount,
  normalizeKind,
  normalizeModality,
  normalizeMoney,
  normalizePriceMode,
  quoteCode,
  sanitizeItems,
} from "../../../../../../lib/quotes/totals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET: descarga el presupuesto como PDF (?inline=1 lo abre en el navegador).
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Presupuesto inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin.from("quotes").select(QUOTE_FIELDS).eq("id", id).maybeSingle();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (presupuestos)." }, { status: 503 });
      console.error("PRESUPUESTO PDF:", error);
      return NextResponse.json({ error: "No se pudo leer el presupuesto." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el presupuesto." }, { status: 404 });

    const discount = normalizeDiscount(data.discount_type, data.discount_value);
    const quote: QuoteForPdf = {
      number: data.number,
      kind: normalizeKind(data.kind),
      client_name: data.client_name,
      client_contact: data.client_contact,
      client_phone: data.client_phone,
      client_email: data.client_email,
      title: data.title,
      event_name: data.event_name ?? null,
      modality: normalizeModality(data.modality),
      items: sanitizeItems(data.items),
      price_mode: normalizePriceMode(data.price_mode),
      package_price_minor: normalizeMoney(data.package_price_minor),
      discount_type: discount.type,
      discount_value: discount.value,
      discount_label: data.discount_label ?? null,
      notes: data.notes,
      valid_days: data.valid_days,
      created_at: data.created_at,
    };

    const bytes = await buildQuotePdf(quote);
    const safeName = data.client_name.normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "cliente";
    const disposition = request.nextUrl.searchParams.get("inline") ? "inline" : "attachment";

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="Presupuesto-${quoteCode(data.number)}-${safeName}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("PRESUPUESTO PDF:", error);
    return NextResponse.json({ error: "No se pudo generar el PDF." }, { status: 500 });
  }
}
