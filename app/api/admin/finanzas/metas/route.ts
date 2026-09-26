import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { isMissingTable, verifyAdmin } from "../../../../../lib/quotes/auth";

const PERIOD = /^\d{4}-\d{2}-01$/;

function currentPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function normalizeGoal(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.round(number), 1_000_000_000_000) : 0;
}

// GET: la meta del mes actual (o del period pedido por query, ?period=YYYY-MM-01).
export async function GET(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const requestedPeriod = request.nextUrl.searchParams.get("period");
    const period = requestedPeriod && PERIOD.test(requestedPeriod) ? requestedPeriod : currentPeriod();

    const admin = createAdminClient();
    const { data, error } = await admin.from("finance_goals").select("id, period, goal_minor").eq("period", period).maybeSingle();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (metas)." }, { status: 503 });
      console.error("METAS GET:", error);
      return NextResponse.json({ error: "No se pudo cargar la meta." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, period, goal: data ? { id: data.id, period: data.period, goalMinor: Number(data.goal_minor) } : null });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// POST: crea/actualiza la meta de un mes (upsert por period).
export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const period = PERIOD.test(body.period) ? body.period : currentPeriod();
    const goalMinor = normalizeGoal(body.goalMinor);
    if (goalMinor <= 0) return NextResponse.json({ error: "Ingresá un monto válido." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("finance_goals")
      .upsert({ period, goal_minor: goalMinor, created_by: verification.userId, updated_at: new Date().toISOString() }, { onConflict: "period" })
      .select("id, period, goal_minor")
      .single();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (metas)." }, { status: 503 });
      console.error("METAS POST:", error);
      return NextResponse.json({ error: "No se pudo guardar la meta." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, goal: { id: data.id, period: data.period, goalMinor: Number(data.goal_minor) } });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
