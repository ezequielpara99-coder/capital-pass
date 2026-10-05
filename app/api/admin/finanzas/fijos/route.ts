import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { isMissingTable, verifyAdmin } from "../../../../../lib/quotes/auth";
import { fetchDollarRates } from "../../../../../lib/finanzas/dolar";
import { computeFinanzasSummary } from "../../../../../lib/finanzas/summary";
import { currentMonthEndAR, currentPeriodAR } from "../../../../../lib/finanzas/period";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = "id, scope, kind, name, category, amount, currency, dollar_type, iva_exterior, day_of_month, active, notes";
const MISSING = "Falta aplicar la actualización de la base de datos (cuentas del mes, 20261019).";

type Body = Record<string, unknown>;

// Valida y normaliza los campos de un item fijo. "partial" para el PATCH
// (solo lo que vino).
function parseItem(body: Body, partial: boolean): { ok: true; values: Record<string, unknown> } | { ok: false; error: string } {
  const values: Record<string, unknown> = {};
  const has = (key: string) => body[key] !== undefined;

  if (!partial || has("scope")) {
    if (!["negocio", "personal"].includes(String(body.scope))) return { ok: false, error: "Elegí si es del negocio o personal." };
    values.scope = body.scope;
  }
  if (!partial || has("kind")) {
    if (!["ingreso", "gasto"].includes(String(body.kind))) return { ok: false, error: "Elegí si es un ingreso o un gasto." };
    values.kind = body.kind;
  }
  if (!partial || has("name")) {
    const name = String(body.name ?? "").trim().slice(0, 120);
    if (!name) return { ok: false, error: "Ponele un nombre." };
    values.name = name;
  }
  if (!partial || has("category")) values.category = String(body.category ?? "").trim().slice(0, 60) || "otros";
  if (!partial || has("amount")) {
    const amount = Math.round(Number(body.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0 || amount >= 10_000_000_000) return { ok: false, error: "El monto tiene que ser mayor a 0." };
    values.amount = amount;
  }
  if (!partial || has("currency")) {
    if (!["ARS", "USD"].includes(String(body.currency))) return { ok: false, error: "Moneda inválida." };
    values.currency = body.currency;
  }
  if (!partial || has("dollarType")) {
    const dollarType = String(body.dollarType ?? "tarjeta");
    if (!["tarjeta", "blue", "mep", "oficial"].includes(dollarType)) return { ok: false, error: "Tipo de dólar inválido." };
    values.dollar_type = dollarType;
  }
  if (!partial || has("ivaExterior")) values.iva_exterior = Boolean(body.ivaExterior);
  if (!partial || has("dayOfMonth")) {
    const raw = body.dayOfMonth;
    if (raw === null || raw === undefined || String(raw).trim() === "") {
      values.day_of_month = null;
    } else {
      const day = Number(raw);
      if (!Number.isInteger(day) || day < 1 || day > 31) return { ok: false, error: "El día del mes tiene que ser entre 1 y 31." };
      values.day_of_month = day;
    }
  }
  if (has("active")) values.active = Boolean(body.active);
  if (!partial || has("notes")) values.notes = String(body.notes ?? "").trim().slice(0, 500) || null;
  return { ok: true, values };
}

function normalizeRow(row: Record<string, unknown>) {
  return { ...row, amount: Number(row.amount) };
}

// Hoy en hora de Argentina: dia del mes y cuantos dias tiene el mes.
function todayAR() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = get("year");
  const month = get("month");
  return { day: get("day"), daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(), month, year };
}

// GET: items fijos + dolar del dia + lo realmente cobrado/gastado este mes
// en el negocio (presupuestos cobrados y gastos cargados en Finanzas).
export async function GET() {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const admin = createAdminClient();
    const [{ data, error }, rates] = await Promise.all([
      admin.from("finance_fixed_items").select(FIELDS).order("kind").order("day_of_month", { ascending: true, nullsFirst: false }).order("name"),
      fetchDollarRates(),
    ]);
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: MISSING }, { status: 503 });
      console.error("FINANZAS FIJOS GET:", error);
      return NextResponse.json({ error: "No se pudieron cargar las cuentas." }, { status: 500 });
    }

    let negocioReal: { cobrado: number; gastos: number } | null = null;
    try {
      const summary = await computeFinanzasSummary(admin, { from: currentPeriodAR(), to: currentMonthEndAR() });
      if (!("error" in summary)) negocioReal = { cobrado: summary.summary.cobrado, gastos: summary.summary.gastos };
    } catch (summaryError) {
      console.error("FINANZAS FIJOS resumen real:", summaryError);
    }

    return NextResponse.json({
      ok: true,
      items: (data ?? []).map(normalizeRow),
      rates,
      today: todayAR(),
      negocioReal,
    });
  } catch (error) {
    console.error("FINANZAS FIJOS GET:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const parsed = parseItem((await request.json()) as Body, false);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data, error } = await createAdminClient().from("finance_fixed_items").insert(parsed.values).select(FIELDS).single();
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: MISSING }, { status: 503 });
      console.error("FINANZAS FIJOS POST:", error);
      return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, item: normalizeRow(data) });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = (await request.json()) as Body;
    const id = String(body.id ?? "");
    if (!UUID.test(id)) return NextResponse.json({ error: "Item inválido." }, { status: 400 });

    const parsed = parseItem(body, true);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data, error } = await createAdminClient()
      .from("finance_fixed_items")
      .update({ ...parsed.values, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(FIELDS)
      .maybeSingle();
    if (error) {
      console.error("FINANZAS FIJOS PATCH:", error);
      return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
    return NextResponse.json({ ok: true, item: normalizeRow(data) });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!UUID.test(id)) return NextResponse.json({ error: "Item inválido." }, { status: 400 });

    const { data, error } = await createAdminClient().from("finance_fixed_items").delete().eq("id", id).select("id").maybeSingle();
    if (error) {
      console.error("FINANZAS FIJOS DELETE:", error);
      return NextResponse.json({ error: "No se pudo borrar." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
