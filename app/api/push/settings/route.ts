import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

const DEFAULTS = { barSaleAlerts: true, lowStockAlerts: true, summaryIntervalMinutes: null as number | null };

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notification_settings")
    .select("bar_sale_alerts, low_stock_alerts, summary_interval_minutes")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("PUSH SETTINGS GET:", error);
    return NextResponse.json({ error: "No se pudieron cargar las preferencias." }, { status: 500 });
  }

  if (!data) return NextResponse.json({ ok: true, settings: DEFAULTS });

  return NextResponse.json({
    ok: true,
    settings: {
      barSaleAlerts: data.bar_sale_alerts,
      lowStockAlerts: data.low_stock_alerts,
      summaryIntervalMinutes: data.summary_interval_minutes,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const barSaleAlerts = Boolean(body.barSaleAlerts);
    const lowStockAlerts = Boolean(body.lowStockAlerts);
    const summaryIntervalMinutes =
      body.summaryIntervalMinutes === null || body.summaryIntervalMinutes === undefined
        ? null
        : Number(body.summaryIntervalMinutes);

    if (summaryIntervalMinutes !== null && (!Number.isInteger(summaryIntervalMinutes) || summaryIntervalMinutes < 5)) {
      return NextResponse.json({ error: "Intervalo de resumen inválido." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

    const admin = createAdminClient();

    const { data: current } = await admin
      .from("notification_settings")
      .select("summary_interval_minutes")
      .eq("user_id", user.id)
      .maybeSingle();

    // Si recien esta activando o cambiando el resumen, arrancamos el
    // contador desde ahora -- si no, el cron encontraria "vencido" un
    // resumen que en realidad nunca se configuro.
    const intervalChanged = current?.summary_interval_minutes !== summaryIntervalMinutes;

    const { error } = await admin.from("notification_settings").upsert(
      {
        user_id: user.id,
        bar_sale_alerts: barSaleAlerts,
        low_stock_alerts: lowStockAlerts,
        summary_interval_minutes: summaryIntervalMinutes,
        ...(intervalChanged ? { last_summary_sent_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("PUSH SETTINGS POST:", error);
      return NextResponse.json({ error: "No se pudieron guardar las preferencias." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
