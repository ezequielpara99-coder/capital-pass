import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { isMissingTable, QUOTE_FIELDS, verifyAdmin } from "../../../../lib/quotes/auth";
import {
  normalizeDiscount,
  normalizeKind,
  normalizeModality,
  normalizeMoney,
  normalizePriceMode,
  sanitizeItems,
} from "../../../../lib/quotes/totals";

const MISSING_SQL = "Falta aplicar la actualización de la base de datos (presupuestos).";

// POST: crea un presupuesto nuevo (borrador).
export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const clientName = String(body.clientName ?? "").trim();
    if (!clientName) return NextResponse.json({ error: "Ingresá el nombre del cliente." }, { status: 400 });

    const discount = normalizeDiscount(body.discountType, body.discountValue);
    const validDays = Number(body.validDays);
    const inquiryId = String(body.rentalInquiryId ?? "").trim();

    const row = {
      kind: normalizeKind(body.kind),
      client_name: clientName.slice(0, 200),
      client_contact: String(body.clientContact ?? "").trim().slice(0, 200) || null,
      client_phone: String(body.clientPhone ?? "").trim().slice(0, 60) || null,
      client_email: String(body.clientEmail ?? "").trim().slice(0, 200) || null,
      title: String(body.title ?? "").trim().slice(0, 200) || null,
      event_name: String(body.eventName ?? "").trim().slice(0, 200) || null,
      modality: normalizeModality(body.modality),
      items: sanitizeItems(body.items),
      price_mode: normalizePriceMode(body.priceMode),
      package_price_minor: normalizeMoney(body.packagePrice),
      discount_type: discount.type,
      discount_value: discount.value,
      discount_label: discount.type === "none" ? null : String(body.discountLabel ?? "").trim().slice(0, 80) || null,
      notes: String(body.notes ?? "").trim().slice(0, 3000) || null,
      valid_days: Number.isFinite(validDays) ? Math.min(Math.max(Math.round(validDays), 0), 365) : 15,
      rental_inquiry_id: inquiryId || null,
      created_by: verification.userId,
    };

    const admin = createAdminClient();
    const { data, error } = await admin.from("quotes").insert(row).select(QUOTE_FIELDS).single();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: MISSING_SQL }, { status: 503 });
      console.error("PRESUPUESTOS POST:", error);
      return NextResponse.json({ error: "No se pudo crear el presupuesto." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, quote: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
