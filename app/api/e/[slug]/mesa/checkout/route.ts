import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { accessTokenFor } from "../../../../../../lib/mercadopago/oauth";
import { getAppBaseUrl, getOrganizerMercadoPago } from "../../../../../../lib/mercadopago/server";
import { safeCheckoutUrl } from "../../../../../../lib/billing/rules";
import { checkRateLimit, getClientIp } from "../../../../../../lib/http/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Errores de negocio de create_online_table_sale que se le muestran al comprador.
const BUSINESS_ERRORS = /ya no esta disponible|no existe|no se puede reservar|no esta habilitado|obligatorio|Mercado Pago|suscripcion/i;

// POST { tableId, firstName, lastName, dni, phone, email? }: reserva una mesa
// y crea el pago en Mercado Pago del organizador. La mesa queda reservada
// hasta que se pague o pasen 30 minutos (el cron de ventas pendientes la
// libera). El webhook de ventas confirma el pago, igual que con las entradas.
export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  let saleIdForRollback: string | null = null;

  try {
    // Cada intento bloquea una mesa real: sin limite, un script podia dejar
    // todas las mesas de un evento "reservadas" durante 30 minutos.
    const ip = getClientIp(request);
    if (!(await checkRateLimit(`mesa-checkout:${ip}`, 4, 300))) {
      return NextResponse.json({ ok: false, error: "Demasiados intentos. Esperá unos minutos y volvé a intentar." }, { status: 429 });
    }

    const body = await request.json();
    const tableId = String(body.tableId ?? "");
    if (!UUID.test(tableId)) return NextResponse.json({ ok: false, error: "Elegí una mesa." }, { status: 400 });

    const firstName = String(body.firstName ?? "").trim().slice(0, 100);
    const lastName = String(body.lastName ?? "").trim().slice(0, 100);
    const dni = String(body.dni ?? "").trim().slice(0, 30);
    const phone = String(body.phone ?? "").trim().slice(0, 40);
    const email = body.email ? String(body.email).trim().slice(0, 200) : null;
    const idempotencyKey = typeof body.idempotencyKey === "string" && UUID.test(body.idempotencyKey) ? body.idempotencyKey : null;

    const admin = createAdminClient();
    const { data: event } = await admin.from("events").select("id, name, organization_id").eq("slug", slug).maybeSingle();
    if (!event) return NextResponse.json({ ok: false, error: "El evento no existe." }, { status: 404 });

    const accessToken = await accessTokenFor(event.organization_id);
    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Este organizador todavía no habilitó la compra online." }, { status: 409 });
    }

    const { data: account } = await admin
      .from("organization_mercadopago_accounts")
      .select("processing_fee_percent, mp_user_id")
      .eq("organization_id", event.organization_id)
      .maybeSingle();

    const created = await admin.rpc("create_online_table_sale", {
      p_event_id: event.id,
      p_table_id: tableId,
      p_buyer_first_name: firstName,
      p_buyer_last_name: lastName,
      p_buyer_dni: dni,
      p_buyer_phone: phone,
      p_buyer_email: email,
      p_idempotency_key: idempotencyKey,
    });

    if (created.error) {
      const message = created.error.message.replace(/^[A-Z0-9]{5}:\s*/, "");
      if (!BUSINESS_ERRORS.test(message)) console.error("MESA ONLINE:", created.error);
      return NextResponse.json({ ok: false, error: BUSINESS_ERRORS.test(message) ? message : "No pudimos reservar la mesa." }, { status: 400 });
    }

    const sale = created.data?.[0] as { sale_id: string; total_minor: number | string; table_name: string; already_existed: boolean } | undefined;
    if (!sale) throw new Error("La reserva no devolvió un identificador.");
    // Solo se cancela en el catch si esta reserva es NUEVA -- una ya
    // existente (reintento con la misma clave) sigue siendo valida.
    if (!sale.already_existed) saleIdForRollback = sale.sale_id;

    // total_minor es bigint: PostgREST lo devuelve como STRING.
    const tableTotal = Number(sale.total_minor);
    const feePercent = Number(account?.processing_fee_percent ?? 0);
    const feeAmount = Math.round(tableTotal * (feePercent / 100));

    const items = [
      { id: `mesa-${tableId}`, title: `Mesa ${sale.table_name} - ${event.name}`, quantity: 1, unit_price: tableTotal, currency_id: "ARS" },
      ...(feeAmount > 0 ? [{ id: "cargo-servicio", title: "Cargo por servicio", quantity: 1, unit_price: feeAmount, currency_id: "ARS" }] : []),
    ];

    const charged = await admin.rpc("set_online_sale_charged_total", {
      p_sale_id: sale.sale_id,
      p_total_charged_minor: tableTotal + feeAmount,
      // Ver comentario en app/api/e/[slug]/checkout/route.ts: snapshot de
      // la cuenta MP usada para esta preference puntual.
      p_mercadopago_collector_id: account?.mp_user_id ?? null,
    });
    if (charged.error) throw new Error(`No se pudo guardar el total: ${charged.error.message}`);

    const base = getAppBaseUrl();
    const back = `${base}/e/${slug}?venta=${sale.sale_id}&mesa=1`;
    const mp = getOrganizerMercadoPago(accessToken);
    const preference = await mp.preference.create({
      body: {
        items,
        payer: { name: firstName, surname: lastName, email: email ?? undefined },
        external_reference: `capitalpass_sale:${sale.sale_id}`,
        notification_url: `${base}/api/mercadopago/webhook-ventas?sale=${sale.sale_id}`,
        back_urls: { success: back, pending: back, failure: back },
        auto_return: "approved",
      },
      requestOptions: { idempotencyKey: sale.sale_id },
    });

    const checkoutUrl = safeCheckoutUrl(preference.init_point);
    if (!checkoutUrl) throw new Error("Mercado Pago no devolvió un enlace válido.");

    return NextResponse.json({ ok: true, checkoutUrl });
  } catch (error) {
    console.error("MESA ONLINE: no se pudo iniciar el pago.", error);

    // Si la reserva ya se creo pero el pago no pudo iniciarse, se cancela
    // enseguida: el trigger libera la mesa (no hace falta esperar 30 minutos).
    if (saleIdForRollback) {
      try {
        // Por funcion de la base: el usuario de servicio no puede modificar sales directamente.
        const rolledBack = await createAdminClient().rpc("cp_cancel_online_sale", { p_sale_id: saleIdForRollback });
        if (rolledBack.error) console.error("MESA ONLINE: no se pudo liberar la mesa.", rolledBack.error.message);
      } catch (rollbackError) {
        console.error("MESA ONLINE: no se pudo liberar la mesa.", rollbackError);
      }
    }

    return NextResponse.json({ ok: false, error: "No pudimos iniciar la reserva. Intentá de nuevo en unos instantes." }, { status: 503 });
  }
}
