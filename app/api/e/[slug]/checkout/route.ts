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
  let saleIdForRollback: string | null = null;

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
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const idempotencyKey = typeof body.idempotencyKey === "string" && UUID.test(body.idempotencyKey) ? body.idempotencyKey : null;

    const admin = createAdminClient();

    const { data: event } = await admin.from("events").select("id, name, organization_id").eq("slug", slug).maybeSingle();
    if (!event) return NextResponse.json({ ok: false, error: "El evento no existe." }, { status: 404 });

    const accessToken = await accessTokenFor(event.organization_id);
    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Este organizador todavía no habilitó la compra online." }, { status: 409 });
    }

    const { data: account } = await admin.from("organization_mercadopago_accounts")
      .select("processing_fee_percent, mp_user_id").eq("organization_id", event.organization_id).maybeSingle();

    const created = await admin.rpc("create_online_sale", {
      p_event_id: event.id,
      p_items: items.map((item) => ({ ticket_type_id: item.ticketTypeId, quantity: item.quantity, pack_id: item.packId ?? null })),
      p_buyer_first_name: buyerFirstName,
      p_buyer_last_name: buyerLastName,
      p_buyer_dni: buyerDni,
      p_buyer_phone: buyerPhone,
      p_buyer_email: buyerEmail,
      p_idempotency_key: idempotencyKey,
    });

    if (created.error) {
      return NextResponse.json({ ok: false, error: created.error.message.replace(/^[A-Z0-9]{5}:\s*/, "") || "No pudimos registrar la compra." }, { status: 400 });
    }

    type SaleItem = { ticket_type_id: string; name: string; quantity: number; unit_price_minor: number; line_total_minor: number; pack_id: string | null };
    const sale = created.data?.[0] as { sale_id: string; total_minor: number; items: SaleItem[]; already_existed: boolean } | undefined;
    if (!sale) throw new Error("La compra no devolvió un identificador.");
    // Si es una venta recien creada (no una que ya existia por la misma
    // clave de idempotencia), y algo falla mas abajo, se cancela para no
    // dejar cupo reservado en el aire. Una venta YA existente (reintento)
    // no se cancela: sigue siendo un intento valido, se puede reintentar
    // de nuevo con la misma clave.
    if (!sale.already_existed) saleIdForRollback = sale.sale_id;

    // total_minor es bigint: PostgREST/el RPC lo devuelve como STRING, no
    // como number. "total_minor + feeAmount" mas abajo usaba "+", que con
    // un string CONCATENA en vez de sumar (ej. "1500" + 50 -> "150050"),
    // corrompiendo el total que se guarda como "lo que se deberia haber
    // cobrado" y que despues el webhook de Mercado Pago usa para verificar
    // el pago real -- rompia la confirmacion automatica de compras online
    // reales, no solo un caso de monto en cero.
    const saleTotalMinor = Number(sale.total_minor);

    // Mercado Pago rechaza items en $0: una tanda gratis (la pagina ya no la
    // ofrece, pero puede quedar un link o pestaña vieja) se corta aca con un
    // mensaje claro y se libera el cupo, en vez del error generico de MP.
    if (sale.items.some((item) => Number(item.line_total_minor) <= 0)) {
      if (saleIdForRollback) {
        const rolledBack = await admin.rpc("cp_cancel_online_sale", { p_sale_id: saleIdForRollback });
        if (rolledBack.error) console.error("VENTAS ONLINE: no se pudo liberar el cupo.", rolledBack.error.message);
      }
      return NextResponse.json(
        { ok: false, error: "Las entradas gratis no se sacan online: pedíselas al organizador o a un RRPP." },
        { status: 400 }
      );
    }

    const feePercent = Number(account?.processing_fee_percent ?? 0);
    const feeAmount = Math.round(saleTotalMinor * (feePercent / 100));

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

    const totalCharged = saleTotalMinor + feeAmount;
    const chargedSaved = await admin.rpc("set_online_sale_charged_total", {
      p_sale_id: sale.sale_id,
      p_total_charged_minor: totalCharged,
      // Snapshot de que cuenta MP se uso para generar ESTA preference -- si
      // el organizador reconecta Mercado Pago despues de esto (cambia de
      // cuenta), la confirmacion del pago tiene que seguir comparando
      // contra la cuenta con la que el comprador realmente pago, no contra
      // la que este vigente en ese momento.
      p_mercadopago_collector_id: account?.mp_user_id ?? null,
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
        notification_url: `${getAppBaseUrl()}/api/mercadopago/webhook-ventas?sale=${sale.sale_id}`,
        back_urls: {
          success: `${getAppBaseUrl()}/e/${slug}?venta=${sale.sale_id}`,
          pending: `${getAppBaseUrl()}/e/${slug}?venta=${sale.sale_id}`,
          failure: `${getAppBaseUrl()}/e/${slug}?venta=${sale.sale_id}`,
        },
        auto_return: "approved",
        // Solo pagos que se aprueban o rechazan en el momento (tarjeta,
        // dinero en cuenta). Sin esto el comprador podia elegir Rapipago/
        // Pago Facil: el carrito se cancela a los 30 minutos y libera el
        // cupo, pero ese pago en efectivo se aprueba horas o dias despues,
        // cuando ya puede no haber lugar -- pagaba y se quedaba sin entrada.
        binary_mode: true,
      },
      requestOptions: { idempotencyKey: sale.sale_id },
    });

    const checkoutUrl = safeCheckoutUrl(preference.init_point);
    if (!checkoutUrl) throw new Error("Mercado Pago no devolvió un enlace válido.");

    return NextResponse.json({ ok: true, checkoutUrl });
  } catch (error) {
    console.error("VENTAS ONLINE: no se pudo iniciar el checkout.", error);

    // Si la venta ya se creo (reservando cupo real) pero el pago no pudo
    // iniciarse (ej. token de Mercado Pago del organizador invalido, o MP
    // caido), se cancela enseguida -- antes quedaba "pending_approval"
    // reservando cupo real hasta que pasara el cron de 30 minutos, y cada
    // reintento del comprador agotaba mas cupo sin ningun pago real.
    if (saleIdForRollback) {
      try {
        const rolledBack = await createAdminClient().rpc("cp_cancel_online_sale", { p_sale_id: saleIdForRollback });
        if (rolledBack.error) console.error("VENTAS ONLINE: no se pudo liberar el cupo.", rolledBack.error.message);
      } catch (rollbackError) {
        console.error("VENTAS ONLINE: no se pudo liberar el cupo.", rollbackError);
      }
    }

    return NextResponse.json({ ok: false, error: "No pudimos iniciar la compra. Intentá de nuevo en unos instantes." }, { status: 503 });
  }
}
