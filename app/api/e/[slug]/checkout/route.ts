import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { accessTokenFor } from "../../../../../lib/mercadopago/oauth";
import { getAppBaseUrl, getOrganizerMercadoPago } from "../../../../../lib/mercadopago/server";
import { safeCheckoutUrl } from "../../../../../lib/billing/rules";
import { checkRateLimit, getClientIp } from "../../../../../lib/http/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CartItem = { ticketTypeId: string; quantity: number; packId?: string };

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  try {
    // Cada request exitosa toma un lock sobre la tanda (compite con
    // compradores reales) y llama a la API de Mercado Pago -- sin
    // limite, un script podia saturar el cupo de un evento popular o
    // agotar la cuota de la cuenta de Mercado Pago de la plataforma.
    const ip = getClientIp(request);
    const allowed = await checkRateLimit(`checkout:${ip}`, 8, 60);
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "Demasiados intentos. Esperá un minuto y volvé a intentar." }, { status: 429 });
    }

    const body = await request.json();
    const items = body.items as CartItem[] | undefined;

    if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
      return NextResponse.json({ ok: false, error: "Elegí al menos una entrada." }, { status: 400 });
    }
    for (const item of items) {
      if (typeof item.ticketTypeId !== "string" || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 20) {
        return NextResponse.json({ ok: false, error: "El carrito tiene datos inválidos." }, { status: 400 });
      }
      if (item.packId !== undefined && typeof item.packId !== "string") {
        return NextResponse.json({ ok: false, error: "El carrito tiene datos inválidos." }, { status: 400 });
      }
    }

    const buyerFirstName = String(body.firstName ?? "").trim().slice(0, 100);
    const buyerLastName = String(body.lastName ?? "").trim().slice(0, 100);
    const buyerDni = String(body.dni ?? "").trim().slice(0, 30);
    const buyerPhone = String(body.phone ?? "").trim().slice(0, 40);
    const buyerEmail = body.email ? String(body.email).trim().slice(0, 200) : null;

    const admin = createAdminClient();

    const { data: event } = await admin.from("events").select("id, name, organization_id").eq("slug", slug).maybeSingle();
    if (!event) return NextResponse.json({ ok: false, error: "El evento no existe." }, { status: 404 });

    const accessToken = await accessTokenFor(event.organization_id);
    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Este organizador todavía no habilitó la compra online." }, { status: 409 });
    }

    const { data: account } = await admin.from("organization_mercadopago_accounts")
      .select("processing_fee_percent").eq("organization_id", event.organization_id).maybeSingle();

    const created = await admin.rpc("create_online_sale", {
      p_event_id: event.id,
      p_items: items.map((item) => ({ ticket_type_id: item.ticketTypeId, quantity: item.quantity, pack_id: item.packId ?? null })),
      p_buyer_first_name: buyerFirstName,
      p_buyer_last_name: buyerLastName,
      p_buyer_dni: buyerDni,
      p_buyer_phone: buyerPhone,
      p_buyer_email: buyerEmail,
    });

    if (created.error) {
      return NextResponse.json({ ok: false, error: created.error.message.replace(/^[A-Z0-9]{5}:\s*/, "") || "No pudimos registrar la compra." }, { status: 400 });
    }

    type SaleItem = { ticket_type_id: string; name: string; quantity: number; unit_price_minor: number; line_total_minor: number; pack_id: string | null };
    const sale = created.data?.[0] as { sale_id: string; total_minor: number; items: SaleItem[] } | undefined;
    if (!sale) throw new Error("La compra no devolvió un identificador.");

    const feePercent = Number(account?.processing_fee_percent ?? 0);
    const feeAmount = Math.round(sale.total_minor * (feePercent / 100));

    // Los items de la preference salen siempre de lo que create_online_sale
    // valido y reservo (mismo lock que valida el cupo) -- nunca de una
    // lectura aparte, para que el monto que ve el comprador y el que
    // despues verifica el webhook nunca puedan desincronizarse. Un pack
    // usa quantity=1 con el TOTAL de la linea (line_total_minor): el precio
    // prorrateado por entrada puede no ser exactamente divisible, y así el
    // cobro real nunca se desvía del total ya validado en la base.
    const preferenceItems = sale.items.map((item) => ({
      id: item.ticket_type_id,
      title: `${event.name} - ${item.name}`,
      quantity: item.pack_id ? 1 : item.quantity,
      unit_price: item.pack_id ? Number(item.line_total_minor) : Number(item.unit_price_minor),
      currency_id: "ARS",
    }));

    if (feeAmount > 0) {
      preferenceItems.push({
        id: "cargo-servicio",
        title: "Cargo por servicio",
        quantity: 1,
        unit_price: feeAmount,
        currency_id: "ARS",
      });
    }

    const totalCharged = sale.total_minor + feeAmount;
    const chargedSaved = await admin.rpc("set_online_sale_charged_total", {
      p_sale_id: sale.sale_id,
      p_total_charged_minor: totalCharged,
    });
    if (chargedSaved.error) {
      console.error("VENTAS ONLINE: no se pudo guardar total_charged_minor.", chargedSaved.error);
      throw new Error(`No se pudo guardar el total de la compra: ${chargedSaved.error.message}`);
    }

    const mp = getOrganizerMercadoPago(accessToken);
    const preference = await mp.preference.create({
      body: {
        items: preferenceItems,
        payer: { name: buyerFirstName, surname: buyerLastName, email: buyerEmail ?? undefined },
        external_reference: `capitalpass_sale:${sale.sale_id}`,
        notification_url: `${getAppBaseUrl()}/api/mercadopago/webhook-ventas`,
        back_urls: {
          success: `${getAppBaseUrl()}/e/${slug}?venta=${sale.sale_id}`,
          pending: `${getAppBaseUrl()}/e/${slug}?venta=${sale.sale_id}`,
          failure: `${getAppBaseUrl()}/e/${slug}?venta=${sale.sale_id}`,
        },
        auto_return: "approved",
      },
      requestOptions: { idempotencyKey: sale.sale_id },
    });

    const checkoutUrl = safeCheckoutUrl(preference.init_point);
    if (!checkoutUrl) throw new Error("Mercado Pago no devolvió un enlace válido.");

    return NextResponse.json({ ok: true, checkoutUrl });
  } catch (error) {
    console.error("VENTAS ONLINE: no se pudo iniciar el checkout.", error);
    return NextResponse.json({ ok: false, error: "No pudimos iniciar la compra. Intentá de nuevo en unos instantes." }, { status: 503 });
  }
}
