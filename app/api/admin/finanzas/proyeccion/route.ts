import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { isMissingTable, verifyAdmin } from "../../../../../lib/quotes/auth";
import { computePendingCollections } from "../../../../../lib/finanzas/pending";

const MONTHS_AHEAD = 6;
const RECURRING_LOOKBACK_DAYS = 45;

// Proyeccion de flujo de caja: no hay fecha de vencimiento cargada en los
// presupuestos, asi que esto NO es un calendario dia a dia -- es una
// estimacion mensual con lo unico que se puede proyectar con datos reales:
// ingreso recurrente (packs mensuales activos), gasto recurrente (gastos
// marcados is_recurring, usando el monto mas reciente de cada uno para no
// sumar el mismo gasto varias veces si se cargo mes a mes) y lo que ya esta
// facturado y pendiente de cobro (se asume que entra pronto, sin fecha).
export async function GET() {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const admin = createAdminClient();

    const { data: packsData, error: packsError } = await admin
      .from("monthly_packs")
      .select("package_price_minor")
      .eq("active", true)
      .is("deleted_at", null);

    if (packsError) {
      if (isMissingTable(packsError)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (packs mensuales)." }, { status: 503 });
      console.error("PROYECCION PACKS:", packsError);
      return NextResponse.json({ error: "No se pudieron cargar los packs mensuales." }, { status: 500 });
    }

    const recurringIncomeMinor = (packsData ?? []).reduce((sum, p) => sum + Number(p.package_price_minor), 0);

    const since = new Date(Date.now() - RECURRING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: expensesData, error: expensesError } = await admin
      .from("expenses")
      .select("description, amount_minor, expense_date")
      .eq("is_recurring", true)
      .is("deleted_at", null)
      .gte("expense_date", since)
      .order("expense_date", { ascending: false });

    if (expensesError) {
      if (isMissingTable(expensesError)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (finanzas)." }, { status: 503 });
      console.error("PROYECCION GASTOS:", expensesError);
      return NextResponse.json({ error: "No se pudieron cargar los gastos recurrentes." }, { status: 500 });
    }

    // Un mismo gasto recurrente ("Alquiler de local") se carga mes a mes --
    // sumar todas las filas sobreestimaria el gasto mensual real. Se toma
    // solo la mas reciente por descripcion.
    const latestByDescription = new Map<string, number>();
    for (const row of expensesData ?? []) {
      const key = row.description.trim().toLowerCase();
      if (!latestByDescription.has(key)) latestByDescription.set(key, Number(row.amount_minor));
    }
    const recurringExpenseMinor = [...latestByDescription.values()].reduce((sum, v) => sum + v, 0);

    const pending = await computePendingCollections(admin);
    if ("error" in pending) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (finanzas)." }, { status: 503 });
    const pendingCollectionsMinor = pending.reduce((sum, row) => sum + row.pendiente, 0);

    const netMonthlyMinor = recurringIncomeMinor - recurringExpenseMinor;
    const now = new Date();
    let cumulative = 0;
    const months = Array.from({ length: MONTHS_AHEAD }).map((_, i) => {
      const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)).toISOString().slice(0, 7);
      const oneTime = i === 0 ? pendingCollectionsMinor : 0;
      const net = netMonthlyMinor + oneTime;
      cumulative += net;
      return { period, recurringIncomeMinor, recurringExpenseMinor, oneTimeMinor: oneTime, netMinor: net, cumulativeMinor: cumulative };
    });

    return NextResponse.json({
      ok: true,
      recurringIncomeMinor,
      recurringExpenseMinor,
      pendingCollectionsMinor,
      months,
    });
  } catch (error) {
    console.error("PROYECCION GET:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
