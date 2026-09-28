import { NextResponse } from "next/server";
import { verifyAdmin, isMissingTable } from "../../../../../lib/quotes/auth";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { fetchAllRows } from "../../../../../lib/supabase/fetch-all";

const FUNNEL_ORDER = ["nuevo", "investigando", "calificado", "listo_para_contactar", "contactado", "respondio", "interesado", "demo", "negociacion", "cliente"] as const;

// GET: metricas del dashboard (contadores + embudo), calculadas sobre los
// datos reales -- nada hardcodeado.
export async function GET() {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const admin = createAdminClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await fetchAllRows<{ status: string; created_at: string }>((from, to) =>
      admin.from("prospects").select("status, created_at").is("deleted_at", null).order("id", { ascending: true }).range(from, to)
    );

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (Capital Sales Agent, 20260990)." }, { status: 503 });
      console.error("SALES AGENT STATS:", error);
      return NextResponse.json({ error: "No se pudieron cargar las métricas." }, { status: 500 });
    }

    const byStatus = new Map<string, number>();
    let newThisWeek = 0;
    for (const row of rows) {
      byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
      if (row.created_at >= sevenDaysAgo) newThisWeek++;
    }

    // El embudo es acumulativo: "llegaron a contactado" incluye a quienes ya
    // pasaron a un estado mas adelante en el pipeline.
    const rank = new Map<string, number>(FUNNEL_ORDER.map((s, i) => [s, i]));
    const funnel = FUNNEL_ORDER.map((stage) => ({
      stage,
      count: rows.filter((r) => (rank.get(r.status) ?? -1) >= (rank.get(stage) ?? 0) || r.status === "cliente").length,
    }));

    const { count: convertedCount } = await admin.from("prospect_conversions").select("id", { count: "exact", head: true });
    const total = rows.length;
    const contacted = rows.filter((r) => (rank.get(r.status) ?? -1) >= (rank.get("contactado") ?? 0)).length;

    return NextResponse.json({
      ok: true,
      totals: {
        prospects: total,
        newThisWeek,
        contacted,
        responded: byStatus.get("respondio") ?? 0,
        interested: byStatus.get("interesado") ?? 0,
        demos: byStatus.get("demo") ?? 0,
        clients: byStatus.get("cliente") ?? 0,
        converted: convertedCount ?? 0,
        conversionRate: total > 0 ? Math.round(((byStatus.get("cliente") ?? 0) / total) * 1000) / 10 : 0,
      },
      byStatus: Object.fromEntries(byStatus),
      funnel,
    });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
