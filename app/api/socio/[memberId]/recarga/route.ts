import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { accessTokenFor } from "../../../../../lib/mercadopago/oauth";
import { getAppBaseUrl, getOrganizerMercadoPago } from "../../../../../lib/mercadopago/server";
import { safeCheckoutUrl } from "../../../../../lib/billing/rules";
import { verifyMemberSignature } from "../../../../../lib/members/signature";
import { checkRateLimit, getClientIp } from "../../../../../lib/http/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ memberId: string }> };

const MIN_TOPUP = 1000;
const MAX_TOPUP = 200000;

// POST { amount }: el socio inicia una recarga de saldo. Crea la recarga
// pendiente y una preferencia de Checkout Pro con el access_token del
// ORGANIZADOR (el pago va a su cuenta). El saldo se acredita recien cuando
// Mercado Pago confirma el pago (webhook o /recarga/verificar).
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { memberId } = await context.params;
    const signature = request.nextUrl.searchParams.get("s") ?? "";
    if (!signature || !verifyMemberSignature(memberId, signature)) {
      return NextResponse.json({ error: "Link inválido." }, { status: 404 });
    }

    const allowed = (await checkRateLimit(`topup-ip:${getClientIp(request)}`, 10, 60)) && (await checkRateLimit(`topup-member:${memberId}`, 6, 600));
    if (!allowed) return NextResponse.json({ error: "Demasiados intentos. Esperá unos minutos." }, { status: 429 });

    const body = await request.json();
    if (body.acceptedTerms !== true) {
      return NextResponse.json({ error: "Tenés que aceptar que el saldo no es reembolsable." }, { status: 400 });
    }
    const amount = Math.round(Number(body.amount));
    if (!Number.isFinite(amount) || amount < MIN_TOPUP || amount > MAX_TOPUP) {
      return NextResponse.json({ error: `Ingresá un monto entre $ ${MIN_TOPUP.toLocaleString("es-AR")} y $ ${MAX_TOPUP.toLocaleString("es-AR")}.` }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: member } = await admin
      .from("premium_members")
      .select("id, organization_id, first_name, last_name, status, expires_at")
      .eq("id", memberId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: "Socio no encontrado." }, { status: 404 });
    if (member.status !== "active" || (member.expires_at && member.expires_at < new Date().toISOString().slice(0, 10))) {
      return NextResponse.json({ error: "Tu membresía no está activa." }, { status: 400 });
    }

    const accessToken = await accessTokenFor(member.organization_id);
    if (!accessToken) {
      return NextResponse.json({ error: "El boliche todavía no habilitó las recargas online." }, { status: 409 });
    }

    const { data: org } = await admin.from("organizations").select("name").eq("id", member.organization_id).maybeSingle();

    const { data: topup, error: insertError } = await admin
      .from("wallet_topups")
      .insert({ organization_id: member.organization_id, member_id: member.id, amount_minor: amount })
      .select("id")
      .single();
    if (insertError || !topup) {
      console.error("RECARGA: no se pudo crear la recarga.", insertError);
      return NextResponse.json({ error: "No pudimos iniciar la recarga." }, { status: 500 });
    }

    const base = getAppBaseUrl();
    const back = `${base}/socio/${member.id}?s=${encodeURIComponent(signature)}&recarga=${topup.id}`;
    const mp = getOrganizerMercadoPago(accessToken);
    const preference = await mp.preference.create({
      body: {
        items: [{ id: `recarga-${topup.id}`, title: `Recarga de saldo (no reembolsable) - ${org?.name ?? "Capital Pass"}`, quantity: 1, unit_price: amount, currency_id: "ARS" }],
        payer: { name: member.first_name, surname: member.last_name },
        external_reference: `capitalpass_topup:${topup.id}`,
        notification_url: `${base}/api/mercadopago/webhook-ventas`,
        back_urls: { success: back, pending: back, failure: back },
        auto_return: "approved",
      },
      requestOptions: { idempotencyKey: topup.id },
    });

    const checkoutUrl = safeCheckoutUrl(preference.init_point);
    if (!checkoutUrl) throw new Error("Mercado Pago no devolvió un enlace válido.");

    return NextResponse.json({ ok: true, checkoutUrl });
  } catch (error) {
    console.error("RECARGA: no se pudo iniciar.", error);
    return NextResponse.json({ error: "No pudimos iniciar la recarga. Intentá de nuevo en unos instantes." }, { status: 503 });
  }
}
