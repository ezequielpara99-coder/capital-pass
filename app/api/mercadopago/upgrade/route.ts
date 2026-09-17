import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { getAppBaseUrl, getPlatformMercadoPago } from "../../../../lib/mercadopago/server";
import { safeCheckoutUrl } from "../../../../lib/billing/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Genera (o reutiliza) el link de pago de Checkout Pro para cobrar la
// diferencia prorrateada de pasar de Gestion basica a Gestion avanzada
// dentro del periodo ya pagado. A diferencia de /api/mercadopago/suscripcion,
// esta ruta requiere que el servicio YA este activo.
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(getAppBaseUrl()).origin) {
    return NextResponse.json({ ok: false, error: "Origen no permitido." }, { status: 403 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Inicia sesion para continuar." }, { status: 401 });

  try {
    const body = await request.json();
    if (typeof body.planId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.planId)) {
      return NextResponse.json({ ok: false, error: "Selecciona un plan valido." }, { status: 400 });
    }

    const admin = createAdminClient();
    const prepared = await admin.rpc("cp_prepare_plan_upgrade", { p_user_id: user.id, p_to_plan_id: body.planId });
    if (prepared.error) {
      return NextResponse.json({ ok: false, error: prepared.error.message || "No se pudo preparar la actualización." }, { status: 400 });
    }
    const charge = prepared.data as { id: string; amount_minor: number; currency: string; to_plan_id: string; checkout_url: string | null };

    if (charge.checkout_url) {
      return NextResponse.json({ ok: true, checkoutUrl: charge.checkout_url, amountMinor: charge.amount_minor });
    }

    const { data: plan } = await admin.from("subscription_plans").select("name").eq("id", charge.to_plan_id).single();

    const result = await getPlatformMercadoPago().preference.create({
      body: {
        items: [{
          id: charge.id, title: `Capital Pass - Actualización a ${plan?.name ?? "nuevo plan"}`, quantity: 1,
          unit_price: Number(charge.amount_minor), currency_id: charge.currency,
        }],
        payer: { email: user.email ?? undefined },
        external_reference: `capitalpass_upgrade:${charge.id}`,
        back_urls: {
          success: `${getAppBaseUrl()}/panel/stock?upgrade=ok`,
          pending: `${getAppBaseUrl()}/panel/stock?upgrade=pendiente`,
          failure: `${getAppBaseUrl()}/panel/stock?upgrade=error`,
        },
        auto_return: "approved",
        binary_mode: true,
      },
      requestOptions: { idempotencyKey: charge.id },
    });

    const checkoutUrl = safeCheckoutUrl(result.init_point);
    if (!result.id || !checkoutUrl) throw new Error("Mercado Pago no devolvio un enlace valido.");

    const saved = await admin.rpc("cp_save_upgrade_checkout", { p_charge_id: charge.id, p_checkout_url: checkoutUrl });
    if (saved.error) throw new Error("No se pudo guardar el intento de pago.");

    return NextResponse.json({ ok: true, checkoutUrl, amountMinor: charge.amount_minor });
  } catch (err) {
    console.error("BILLING UPGRADE:", err);
    return NextResponse.json({ ok: false, error: "No pudimos iniciar la actualización de plan." }, { status: 503 });
  }
}
