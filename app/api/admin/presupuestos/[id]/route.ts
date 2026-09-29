import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { isMissingTable, QUOTE_FIELDS, verifyAdmin } from "../../../../../lib/quotes/auth";
import {
  normalizeDiscount,
  normalizeKind,
  normalizeModality,
  normalizeMoney,
  normalizePriceMode,
  normalizeQuoteResponse,
  normalizeStatus,
  sanitizeItems,
} from "../../../../../lib/quotes/totals";

type Context = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max) || null;
}

// GET: un presupuesto individual -- lo usa el editor del lado del cliente
// para poder abrir /admin/presupuestos/[id] sin depender de un render
// server-side (necesario para que la página pueda cachearse y abrir offline).
export async function GET(_request: NextRequest, context: Context) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Presupuesto inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin.from("quotes").select(QUOTE_FIELDS).eq("id", id).is("deleted_at", null).maybeSingle();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (presupuestos)." }, { status: 503 });
      console.error("PRESUPUESTOS GET:", error);
      return NextResponse.json({ error: "No se pudo consultar el presupuesto." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el presupuesto." }, { status: 404 });

    return NextResponse.json({ ok: true, quote: normalizeQuoteResponse(data) });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH: edita un presupuesto. Solo se tocan los campos que llegan.
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Presupuesto inválido." }, { status: 400 });

    const body = await request.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.clientName !== undefined) {
      const name = String(body.clientName).trim();
      if (!name) return NextResponse.json({ error: "Ingresá el nombre del cliente." }, { status: 400 });
      updates.client_name = name.slice(0, 200);
    }
    if (body.kind !== undefined) updates.kind = normalizeKind(body.kind);

    const admin = createAdminClient();

    if (body.status !== undefined) {
      const newStatus = normalizeStatus(body.status);
      // Si el presupuesto ya tiene pagos registrados, no lo dejamos volver a
      // un estado no facturable (borrador/revision/rechazado) -- esos pagos
      // ya cobrados dejan de contar como "cobrado" en los informes de
      // finanzas apenas el status deja de ser a_pagar/aceptado (el resto de
      // la plata sigue ahi, pero desaparece de la vista sin ningun aviso).
      if (newStatus !== "a_pagar" && newStatus !== "aceptado") {
        const { count: paymentsCount } = await admin
          .from("quote_payments")
          .select("id", { count: "exact", head: true })
          .eq("quote_id", id)
          .is("deleted_at", null);
        if ((paymentsCount ?? 0) > 0) {
          return NextResponse.json(
            { error: "Este presupuesto ya tiene pagos registrados: no se puede volver a un estado sin facturar. Borrá los pagos primero si es un error." },
            { status: 409 }
          );
        }
      }
      updates.status = newStatus;
    }
    if (body.clientContact !== undefined) updates.client_contact = optionalText(body.clientContact, 200);
    if (body.clientPhone !== undefined) updates.client_phone = optionalText(body.clientPhone, 60);
    if (body.clientEmail !== undefined) updates.client_email = optionalText(body.clientEmail, 200);
    if (body.title !== undefined) updates.title = optionalText(body.title, 200);
    if (body.notes !== undefined) updates.notes = optionalText(body.notes, 20000);
    if (body.items !== undefined) updates.items = sanitizeItems(body.items);
    if (body.eventName !== undefined) updates.event_name = optionalText(body.eventName, 200);
    if (body.modality !== undefined) updates.modality = normalizeModality(body.modality);
    if (body.priceMode !== undefined) updates.price_mode = normalizePriceMode(body.priceMode);
    if (body.packagePrice !== undefined) updates.package_price_minor = normalizeMoney(body.packagePrice);

    if (body.discountType !== undefined || body.discountValue !== undefined) {
      const discount = normalizeDiscount(body.discountType, body.discountValue);
      updates.discount_type = discount.type;
      updates.discount_value = discount.value;
      updates.discount_label = discount.type === "none" ? null : optionalText(body.discountLabel, 80);
    }

    if (body.validDays !== undefined) {
      const days = Number(body.validDays);
      updates.valid_days = Number.isFinite(days) ? Math.min(Math.max(Math.round(days), 0), 365) : 15;
    }

    const { data, error } = await admin.from("quotes").update(updates).eq("id", id).is("deleted_at", null).select(QUOTE_FIELDS).maybeSingle();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (presupuestos)." }, { status: 503 });
      console.error("PRESUPUESTOS PATCH:", error);
      return NextResponse.json({ error: "No se pudo guardar el presupuesto." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el presupuesto." }, { status: 404 });

    return NextResponse.json({ ok: true, quote: normalizeQuoteResponse(data) });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE: borra un presupuesto (soft-delete -- queda en la base con
// deleted_at, recuperable desde /admin/papelera).
export async function DELETE(_request: NextRequest, context: Context) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Presupuesto inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("quotes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("PRESUPUESTOS DELETE:", error);
      return NextResponse.json({ error: "No se pudo borrar el presupuesto." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el presupuesto." }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
