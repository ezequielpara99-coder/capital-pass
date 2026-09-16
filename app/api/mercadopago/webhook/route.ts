import { NextRequest, NextResponse } from "next/server";
import { WebhookSignatureValidator } from "mercadopago";
import { reconcilePayment } from "../../../../lib/billing/server";
import { validResourceId } from "../../../../lib/billing/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("BILLING: falta MERCADOPAGO_WEBHOOK_SECRET.");
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
    if (type === "payment") {
      await reconcilePayment(id);
    } else {
      return NextResponse.json({ ok: true, ignored: true });
    }
    return NextResponse.json({ ok: true });
  } catch {
    console.error("BILLING: notificacion pendiente de conciliacion; Mercado Pago puede reintentar.");
    return NextResponse.json({ error: "No se pudo verificar la notificacion." }, { status: 503 });
  }
}
