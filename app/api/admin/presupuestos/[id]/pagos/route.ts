import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { isMissingTable, verifyAdmin } from "../../../../../../lib/quotes/auth";

type Context = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS = ["transferencia", "efectivo", "mercadopago", "tarjeta", "otro"] as const;

function normalizeMethod(value: unknown) {
  return (METHODS as readonly string[]).includes(String(value)) ? (value as (typeof METHODS)[number]) : "transferencia";
}

function normalizeAmount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.round(number), 1_000_000_000) : 0;
}

function normalizeDate(value: unknown) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 10);
}

// GET: pagos registrados contra un presupuesto puntual.
export async function GET(_request: NextRequest, context: Context) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Presupuesto inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("quote_payments")
      .select("id, amount_minor, paid_at, method, notes, created_at")
      .eq("quote_id", id)
      .order("paid_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (finanzas)." }, { status: 503 });
      console.error("PAGOS GET:", error);
      return NextResponse.json({ error: "No se pudieron cargar los pagos." }, { status: 500 });
    }

    const payments = (data ?? []).map((row) => ({ ...row, amount_minor: Number(row.amount_minor) }));
    return NextResponse.json({ ok: true, payments });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// POST: registra un cobro contra un presupuesto facturado (a_pagar/aceptado).
export async function POST(request: NextRequest, context: Context) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Presupuesto inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { data: quote, error: quoteError } = await admin.from("quotes").select("id, status").eq("id", id).maybeSingle();

    if (quoteError) {
      if (isMissingTable(quoteError)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (presupuestos)." }, { status: 503 });
      console.error("PAGOS POST QUOTE:", quoteError);
      return NextResponse.json({ error: "No se pudo verificar el presupuesto." }, { status: 500 });
    }
    if (!quote) return NextResponse.json({ error: "No se encontró el presupuesto." }, { status: 404 });
    if (quote.status !== "a_pagar" && quote.status !== "aceptado") {
      return NextResponse.json({ error: "Solo se pueden registrar pagos sobre presupuestos facturados (a pagar o aceptados)." }, { status: 400 });
    }

    const body = await request.json();
    const amountMinor = normalizeAmount(body.amountMinor);
    if (amountMinor <= 0) return NextResponse.json({ error: "Ingresá un monto válido." }, { status: 400 });

    const { data, error } = await admin
      .from("quote_payments")
      .insert({
        quote_id: id,
        amount_minor: amountMinor,
        paid_at: normalizeDate(body.paidAt),
        method: normalizeMethod(body.method),
        notes: String(body.notes ?? "").trim().slice(0, 2000) || null,
        created_by: verification.userId,
      })
      .select("id, amount_minor, paid_at, method, notes, created_at")
      .single();

    if (error) {
      console.error("PAGOS POST:", error);
      return NextResponse.json({ error: "No se pudo registrar el pago." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, payment: { ...data, amount_minor: Number(data.amount_minor) } });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE: borra un pago (?paymentId=), por si se cargó mal.
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Presupuesto inválido." }, { status: 400 });

    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get("paymentId") ?? "";
    if (!UUID.test(paymentId)) return NextResponse.json({ error: "Pago inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from("quote_payments").delete().eq("id", paymentId).eq("quote_id", id);

    if (error) {
      console.error("PAGOS DELETE:", error);
      return NextResponse.json({ error: "No se pudo borrar el pago." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
