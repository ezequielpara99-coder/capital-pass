import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { isMissingTable, verifyAdmin } from "../../../../../lib/quotes/auth";

const KINDS = ["diseno", "rental", "general"] as const;
const METHODS = ["transferencia", "efectivo", "mercadopago", "tarjeta", "otro"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeKind(value: unknown) {
  return (KINDS as readonly string[]).includes(String(value)) ? (value as (typeof KINDS)[number]) : "general";
}

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

// GET: lista de gastos, con filtros opcionales por rango de fecha y area.
export async function GET(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const kind = searchParams.get("kind");

    const admin = createAdminClient();
    let query = admin
      .from("expenses")
      .select("id, kind, category, description, amount_minor, expense_date, payment_method, is_recurring, notes, created_at")
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (from) query = query.gte("expense_date", from);
    if (to) query = query.lte("expense_date", to);
    if (kind && (KINDS as readonly string[]).includes(kind)) query = query.eq("kind", kind);

    const { data, error } = await query;

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (finanzas)." }, { status: 503 });
      console.error("GASTOS GET:", error);
      return NextResponse.json({ error: "No se pudieron cargar los gastos." }, { status: 500 });
    }

    const expenses = (data ?? []).map((row) => ({ ...row, amount_minor: Number(row.amount_minor) }));
    return NextResponse.json({ ok: true, expenses });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// POST: registra un gasto nuevo.
export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const description = String(body.description ?? "").trim().slice(0, 300);
    if (!description) return NextResponse.json({ error: "Ingresá una descripción del gasto." }, { status: 400 });

    const amountMinor = normalizeAmount(body.amountMinor);
    if (amountMinor <= 0) return NextResponse.json({ error: "Ingresá un monto válido." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("expenses")
      .insert({
        kind: normalizeKind(body.kind),
        category: String(body.category ?? "otros").trim().slice(0, 60) || "otros",
        description,
        amount_minor: amountMinor,
        expense_date: normalizeDate(body.expenseDate),
        payment_method: normalizeMethod(body.paymentMethod),
        is_recurring: Boolean(body.isRecurring),
        notes: String(body.notes ?? "").trim().slice(0, 2000) || null,
        created_by: verification.userId,
      })
      .select("id, kind, category, description, amount_minor, expense_date, payment_method, is_recurring, notes, created_at")
      .single();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (finanzas)." }, { status: 503 });
      console.error("GASTOS POST:", error);
      return NextResponse.json({ error: "No se pudo guardar el gasto." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, expense: { ...data, amount_minor: Number(data.amount_minor) } });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE: borra un gasto (?id=).
export async function DELETE(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id") ?? "";
    if (!UUID.test(id)) return NextResponse.json({ error: "Gasto inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from("expenses").delete().eq("id", id);

    if (error) {
      console.error("GASTOS DELETE:", error);
      return NextResponse.json({ error: "No se pudo borrar el gasto." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
