import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { previousMonthRange } from "../../../../lib/panel/period";
import { sendPushToMember } from "../../../../lib/push/server";
import { createMemberPublicPath } from "../../../../lib/members/signature";

export const dynamic = "force-dynamic";

// Corre todos los dias a las 00:10 (hora Argentina, ver vercel.json). Cierra
// el ranking del mes ANTERIOR de cada boliche que tenga premios cargados y
// guarda a los ganadores. Es idempotente (una fila por boliche + mes + puesto):
// si corre de nuevo, o se reintenta, no duplica nada.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { period, from, to } = previousMonthRange();

  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id")
    .eq("member_ranking_enabled", true)
    .or("member_prize_1.not.is.null,member_prize_2.not.is.null,member_prize_3.not.is.null")
    .limit(1000);

  if (error) {
    if (/member_prize|schema cache|does not exist/i.test(error.message ?? "")) {
      return NextResponse.json({ ok: true, skipped: "missing_migration" });
    }
    console.error("CIERRE RANKING:", error);
    return NextResponse.json({ error: "No se pudo listar los boliches." }, { status: 500 });
  }

  let winners = 0;
  let failed = 0;
  for (const org of orgs ?? []) {
    const result = await admin.rpc("member_close_month", {
      p_organization_id: org.id,
      p_period: period,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    });
    if (result.error) {
      failed++;
      console.error("CIERRE RANKING: fallo el boliche", org.id, result.error);
    } else {
      winners += Number(result.data ?? 0);
    }
  }

  // Aviso al celular de cada ganador. Cada aviso se reclama de forma atomica
  // (notified_at) antes de mandarse: si el cron se reintenta, no se repite.
  let notified = 0;
  const { data: pending, error: pendingError } = await admin
    .from("member_monthly_winners")
    .select("id, member_id, position, prize")
    .eq("period", period)
    .is("notified_at", null)
    .limit(500);

  if (pendingError) {
    if (!/notified_at|schema cache|does not exist/i.test(pendingError.message ?? "")) console.error("CIERRE RANKING avisos:", pendingError);
  } else {
    for (const winner of pending ?? []) {
      const claimed = await admin
        .from("member_monthly_winners")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", winner.id)
        .is("notified_at", null)
        .select("id");
      if (claimed.error || (claimed.data?.length ?? 0) === 0) continue;

      const monthName = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period}-01T00:00:00Z`));
      await sendPushToMember(winner.member_id as string, {
        title: winner.position === 1 ? "Ganaste el ranking" : `Quedaste en el puesto ${winner.position} del ranking`,
        body: `${monthName}: ${winner.prize}. Mostrá tu carnet para retirarlo.`,
        url: createMemberPublicPath(winner.member_id as string),
      });
      notified++;
    }
  }

  return NextResponse.json({ ok: true, period, organizations: orgs?.length ?? 0, newWinners: winners, failed, notified });
}
