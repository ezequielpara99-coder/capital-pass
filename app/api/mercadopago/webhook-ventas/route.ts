import { NextRequest, NextResponse } from "next/server";
import { WebhookSignatureValidator } from "mercadopago";
import { getPayment } from "../../../../lib/billing/provider";
import { saleFromReference, validResourceId } from "../../../../lib/billing/rules";
import { applySalePayment } from "../../../../lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Notificaciones de pagos de ventas online (Marketplace/OAuth): el pago se
// crea con el access_token del organizador, pero lo LEEMOS con el token de
// la plataforma (acceso de marketplace a sus transacciones conectadas) y
// verificamos que el collector_id sea justo el de ESE organizador -- nunca
// confiamos en el monto/organizacion que venga del lado del cliente.
export async function POST(request: NextRequest) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("VENTAS ONLINE: falta MERCADOPAGO_WEBHOOK_SECRET.");
    return NextResponse.json({ error: "Notificaciones sin configurar." }, { status: 503 });
  }
  const id = request.nextUrl.searchParams.get("data.id");
  if (!validResourceId(id)) return NextResponse.json({ error: "Referencia invalida." }, { status: 400 });
  try {
    WebhookSignatureValidator.validate({
      xSignature: request.headers.get("x-signature") ?? "",
      xRequestId: request.headers.get("x-request-id") ?? "",
      dataId: id, secret,
    });
  } catch {
    return NextResponse.json({ error: "Firma invalida." }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (body.data?.id != null && String(body.data.id).toLowerCase() !== id.toLowerCase()) {
      return NextResponse.json({ error: "Referencia inconsistente." }, { status: 400 });
    }
    const type = body.type ?? request.nextUrl.searchParams.get("type");
    if (type !== "payment") return NextResponse.json({ ok: true, ignored: true });

    const payment = await getPayment(id);
    const saleId = saleFromReference(payment.external_reference);
    if (!saleId) return NextResponse.json({ ok: true, ignored: true });

    const applied = await applySalePayment(payment, saleId);
    if (!applied) return NextResponse.json({ ok: true, ignored: true });

    return NextResponse.json({ ok: true });
  } catch {
    console.error("VENTAS ONLINE: notificacion pendiente de conciliacion; Mercado Pago puede reintentar.");
    return NextResponse.json({ error: "No se pudo verificar la notificacion." }, { status: 503 });
  }
}
