import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { getAppBaseUrl } from "../../../../lib/mercadopago/server";
import { sendRenewalReminder } from "../../../../lib/email/renewal-reminder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Corre una vez por dia (ver vercel.json). Avisa a los organizadores cuya
// suscripcion vence en los proximos 5 dias, una sola vez por periodo.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const in5Days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  const { data: subscriptions, error } = await admin
    .from("organization_subscriptions")
    .select("id, signup_id, organization_name, plan_name, payer_email, current_period_end, reminder_sent_for_period_end")
    .eq("status", "active")
    .not("current_period_end", "is", null)
    .lte("current_period_end", in5Days.toISOString())
    .gte("current_period_end", now.toISOString());

  if (error) {
    console.error("CRON RECORDATORIOS: no se pudo consultar suscripciones.", error);
    return NextResponse.json({ error: "No se pudo consultar suscripciones." }, { status: 500 });
  }

  // El recordatorio ya se mando para este mismo periodo: no repetir.
  const pending = (subscriptions ?? []).filter(
    (s) => s.reminder_sent_for_period_end !== s.current_period_end
  );

  // Traer todo lo que hace falta de una sola vez (en vez de 2-3 queries MAS
  // por cada suscripcion pendiente dentro del loop) -- este cron corre una
  // vez al dia y la cantidad de suscripciones por vencer crece con la base
  // de clientes, asi que el N+1 se hace mas lento con el tiempo.
  const signupIds = pending.map((s) => s.signup_id).filter((id): id is string => Boolean(id));
  const { data: signupRows } = signupIds.length
    ? await admin.from("subscription_signups").select("id, first_name, last_name, organization_id").in("id", signupIds)
    : { data: [] };
  const signupById = new Map((signupRows ?? []).map((s) => [s.id, s]));

  const organizationIds = [...new Set((signupRows ?? []).map((s) => s.organization_id).filter((id): id is string => Boolean(id)))];
  const { data: upgradeRows } = organizationIds.length
    ? await admin
        .from("plan_upgrade_charges")
        .select("organization_id, to_plan_id, period_end_at_charge, created_at")
        .in("organization_id", organizationIds)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
    : { data: [] };

  const planIds = [...new Set((upgradeRows ?? []).map((u) => u.to_plan_id))];
  const { data: planRows } = planIds.length
    ? await admin.from("subscription_plans").select("id, name").in("id", planIds)
    : { data: [] };
  const planNameById = new Map((planRows ?? []).map((p) => [p.id, p.name]));

  let sent = 0;

  // Si UNA suscripcion falla (excepcion real de red, no solo un error
  // suave) no puede cortar el resto del lote -- antes una sola falla
  // dejaba sin recordatorio a todas las que venian despues en el array
  // hasta la corrida del dia siguiente.
  for (const subscription of pending) {
    try {
      const signup = subscription.signup_id ? signupById.get(subscription.signup_id) : undefined;
      const customerName = signup ? `${signup.first_name} ${signup.last_name}`.trim() : subscription.organization_name;

      // Si pago un upgrade a Gestion avanzada vigente para este mismo
      // periodo, avisar con ese nombre de plan en vez del original (que no
      // se toca al hacer un upgrade, para no arriesgar pisarlo con un
      // reintento del webhook de la basica).
      let planName = subscription.plan_name;
      if (signup?.organization_id) {
        const upgrade = (upgradeRows ?? []).find(
          (u) => u.organization_id === signup.organization_id && u.period_end_at_charge === subscription.current_period_end
        );
        if (upgrade?.to_plan_id) {
          const upgradedPlanName = planNameById.get(upgrade.to_plan_id);
          if (upgradedPlanName) planName = upgradedPlanName;
        }
      }

      // Reclamo atomico ANTES de mandar: si esta corrida se solapa con otra
      // (Vercel Cron reintenta, o el cron de ayer todavia no termino con el
      // resto del lote), el UPDATE...WHERE deja pasar a una sola de las dos
      // -- antes se mandaba el email primero y se marcaba despues, asi que
      // dos corridas casi simultaneas podian ver reminder_sent_for_period_end
      // desactualizado y mandar el mismo recordatorio 2 veces.
      const claimed = await admin.from("organization_subscriptions")
        .update({ reminder_sent_for_period_end: subscription.current_period_end })
        .eq("id", subscription.id)
        .or(`reminder_sent_for_period_end.is.null,reminder_sent_for_period_end.neq.${subscription.current_period_end}`)
        .select("id");

      if ((claimed.data?.length ?? 0) === 0) continue; // otra corrida ya lo reclamo

      const result = await sendRenewalReminder({
        to: subscription.payer_email,
        customerName,
        organizationName: subscription.organization_name,
        planName,
        periodEnd: subscription.current_period_end,
        renewUrl: `${getAppBaseUrl()}/cuenta`,
      });

      if (!result.ok) {
        console.error("CRON RECORDATORIOS: no se pudo enviar el recordatorio (ya quedo reclamado, no reintenta hasta el proximo vencimiento).", subscription.id, result.error);
        continue;
      }

      sent++;
    } catch (error) {
      console.error("CRON RECORDATORIOS: fallo procesando una suscripcion, sigue con el resto.", subscription.id, error);
    }
  }

  return NextResponse.json({ ok: true, sent, total: pending.length });
}
