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

  let sent = 0;

  for (const subscription of pending) {
    const { data: signup } = subscription.signup_id
      ? await admin.from("subscription_signups").select("first_name, last_name, organization_id").eq("id", subscription.signup_id).maybeSingle()
      : { data: null };

    const customerName = signup ? `${signup.first_name} ${signup.last_name}`.trim() : subscription.organization_name;

    // Si pago un upgrade a Gestion avanzada vigente para este mismo
    // periodo, avisar con ese nombre de plan en vez del original (que no
    // se toca al hacer un upgrade, para no arriesgar pisarlo con un
    // reintento del webhook de la basica).
    let planName = subscription.plan_name;
    if (signup?.organization_id) {
      const { data: upgrade } = await admin
        .from("plan_upgrade_charges")
        .select("to_plan_id")
        .eq("organization_id", signup.organization_id)
        .eq("status", "approved")
        .eq("period_end_at_charge", subscription.current_period_end)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (upgrade?.to_plan_id) {
        const { data: upgradedPlan } = await admin.from("subscription_plans").select("name").eq("id", upgrade.to_plan_id).maybeSingle();
        if (upgradedPlan?.name) planName = upgradedPlan.name;
      }
    }

    const result = await sendRenewalReminder({
      to: subscription.payer_email,
      customerName,
      organizationName: subscription.organization_name,
      planName,
      periodEnd: subscription.current_period_end,
      renewUrl: `${getAppBaseUrl()}/cuenta`,
    });

    if (!result.ok) {
      console.error("CRON RECORDATORIOS: no se pudo enviar el recordatorio.", subscription.id, result.error);
      continue;
    }

    const updated = await admin.from("organization_subscriptions")
      .update({ reminder_sent_for_period_end: subscription.current_period_end })
      .eq("id", subscription.id);

    if (updated.error) {
      console.error("CRON RECORDATORIOS: se envio el email pero no se pudo marcar como enviado.", subscription.id);
    }

    sent++;
  }

  return NextResponse.json({ ok: true, sent, total: pending.length });
}
