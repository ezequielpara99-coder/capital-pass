import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { getAppBaseUrl, getPlatformMercadoPago } from "../../../../lib/mercadopago/server";
import { reconcileUser, type Signup } from "../../../../lib/billing/server";
import { safeCheckoutUrl } from "../../../../lib/billing/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(getAppBaseUrl()).origin) {
    return NextResponse.json({ ok: false, error: "Origen no permitido." }, { status: 403 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Inicia sesion para continuar." }, { status: 401 });
  if (!user.email_confirmed_at) return NextResponse.json({ ok: false, error: "Confirma tu email." }, { status: 403 });
  try {
    const account = await reconcileUser(user);
    if (account.active) return NextResponse.json({ ok: false, error: "Tu servicio ya esta activo. No hace falta otro pago." }, { status: 409 });
    if (!account.organizationId) return NextResponse.json({ ok: false, error: "La suscripcion la administra el organizador." }, { status: 403 });
    const body = await request.json();
    if (typeof body.planId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.planId)) {
      return NextResponse.json({ ok: false, error: "Selecciona un plan valido." }, { status: 400 });
    }
    const admin = createAdminClient();
    const prepared = await admin.rpc("cp_prepare_checkout", { p_user_id: user.id, p_plan_id: body.planId });
    if (prepared.error) throw new Error("No se pudo preparar la suscripcion.");
    const signup = prepared.data as Signup;
    if (signup.mercadopago_preapproval_id) {
      const existing = safeCheckoutUrl(signup.checkout_url);
      if (signup.mp_status !== "pending" || !existing) {
        return NextResponse.json({ ok: false, error: "Ya hay una suscripcion en proceso. Usa Verificar mi pago; no inicies otra compra." }, { status: 409 });
      }
      return NextResponse.json({ ok: true, checkoutUrl: existing });
    }
    const lock = await admin.rpc("cp_lock_checkout", { p_signup_id: signup.id });
    if (lock.error || !lock.data) return NextResponse.json({ ok: false, error: "Estamos preparando tu suscripcion. Espera unos segundos y reintenta." }, { status: 409 });
    const { data: plan, error: planError } = await admin.from("subscription_plans").select("name").eq("id", signup.plan_id).single();
    if (planError) throw new Error("No se pudo consultar el plan.");
    const result = await getPlatformMercadoPago().preApproval.create({
      body: {
        reason: plan.name, external_reference: `capitalpass_signup:${signup.id}`,
        payer_email: signup.email, status: "pending",
        back_url: `${getAppBaseUrl()}/cuenta?retorno=mercadopago`,
        auto_recurring: {
          frequency: signup.frequency_months, frequency_type: "months",
          transaction_amount: Number(signup.expected_amount), currency_id: signup.expected_currency,
        },
      },
      requestOptions: { idempotencyKey: signup.id },
    });
    const checkoutUrl = safeCheckoutUrl(result.init_point);
    if (!result.id || !checkoutUrl) throw new Error("Mercado Pago no devolvio un enlace valido.");
    const saved = await admin.from("subscription_signups").update({
      mercadopago_preapproval_id: result.id, checkout_url: checkoutUrl,
      mp_status: result.status, mercadopago_external_reference: `capitalpass_signup:${signup.id}`,
    }).eq("id", signup.id);
    if (saved.error) throw new Error("No se pudo guardar el intento de pago.");
    return NextResponse.json({ ok: true, checkoutUrl });
  } catch (e) {
    console.error("BILLING DEBUG:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "No pudimos verificar la suscripcion. Si ya pagaste, no vuelvas a pagar: reintenta Verificar mi pago." }, { status: 503 });
  }
}
