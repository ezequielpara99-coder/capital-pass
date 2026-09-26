import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { computePendingCollections } from "../../../../lib/finanzas/pending";
import { sendPushToPlatformAdmins } from "../../../../lib/push/server";
import { formatMoney } from "../../../../lib/quotes/totals";

const OVERDUE_DAYS = 15;

// Corre una vez por dia (ver vercel.json). Si hay presupuestos facturados
// con mas de 15 dias sin cobrarse, manda UN push resumen a los admins de
// plataforma (Eze) -- no uno por presupuesto, para no spamear. Reclama el
// aviso de HOY de forma atomica antes de calcular nada: si el cron se
// reintenta o se solapa, solo la primera corrida manda el push.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const claimed = await admin.from("payment_reminders_log").insert({ sent_date: today }).select("sent_date");
  if (claimed.error || (claimed.data?.length ?? 0) === 0) {
    return NextResponse.json({ ok: true, alreadySent: true });
  }

  try {
    const pending = await computePendingCollections(admin);
    if ("error" in pending) return NextResponse.json({ ok: true, sent: false, reason: "missing_table" });

    const now = Date.now();
    const overdue = pending.filter((row) => (now - new Date(row.updatedAt).getTime()) / (1000 * 60 * 60 * 24) > OVERDUE_DAYS);

    if (overdue.length === 0) {
      return NextResponse.json({ ok: true, sent: false, overdue: 0 });
    }

    const totalPendiente = overdue.reduce((sum, row) => sum + row.pendiente, 0);

    await sendPushToPlatformAdmins({
      title: "💸 Cobros pendientes",
      body: `${overdue.length} presupuesto${overdue.length !== 1 ? "s" : ""} con más de ${OVERDUE_DAYS} días sin cobrarse — ${formatMoney(totalPendiente)} en total.`,
      url: "/admin/finanzas/cobros",
    });

    return NextResponse.json({ ok: true, sent: true, overdue: overdue.length, totalPendiente });
  } catch (error) {
    console.error("CRON RECORDATORIO COBROS:", error);
    return NextResponse.json({ error: "No se pudo calcular el recordatorio." }, { status: 500 });
  }
}
