import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { reconcileOnlineSale } from "../../../../../../lib/billing/server";
import { validResourceId } from "../../../../../../lib/billing/rules";
import { checkRateLimit, getClientIp } from "../../../../../../lib/http/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Debajo de este intervalo, un pedido repetido para la misma venta no
// vuelve a golpear la API de Mercado Pago -- solo devuelve el ultimo
// estado conocido. Sin esto, cualquiera con el UUID de una venta (visible
// en la URL de vuelta) podia spamear este endpoint y agotar la cuota de
// la cuenta de Mercado Pago de la plataforma.
const RECONCILE_COOLDOWN_MS = 10_000;

// Publico, sin sesion: el comprador solo tiene el UUID de su propia venta
// (ya visible en la URL de vuelta de Mercado Pago). Si el webhook todavia
// no proceso el pago -- por ejemplo, una notificacion que se perdio o
// llego fuera de orden -- esto busca el pago real por su referencia y lo
// aplica, en vez de dejar al comprador esperando sin ninguna forma de
// confirmar que ya pago.
export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  try {
    // El cooldown por venta (mas abajo) ya cubre lo mas costoso, pero esto
    // ademas frena a alguien que genere muchas ventas (via /checkout, que
    // tiene su propio limite) y las verifique todas seguidas.
    const ip = getClientIp(request);
    const allowed = await checkRateLimit(`verificar:${ip}`, 20, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Demasiados intentos. Esperá un minuto y volvé a intentar." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const saleId = String(body.saleId ?? "").trim();
    if (!validResourceId(saleId)) {
      return NextResponse.json({ error: "Referencia invalida." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: sale } = await admin.from("sales")
      .select("id, status, event_id, last_reconciled_at")
      .eq("id", saleId).eq("channel", "online").maybeSingle();
    if (!sale) {
      return NextResponse.json({ error: "No encontramos esa venta." }, { status: 404 });
    }

    const { data: event } = await admin.from("events").select("slug").eq("id", sale.event_id).maybeSingle();
    if (!event || event.slug !== slug) {
      return NextResponse.json({ error: "No encontramos esa venta." }, { status: 404 });
    }

    const lastReconciledMs = sale.last_reconciled_at ? new Date(sale.last_reconciled_at).getTime() : 0;
    const withinCooldown = Date.now() - lastReconciledMs < RECONCILE_COOLDOWN_MS;

    if (sale.status === "pending_approval" && !withinCooldown) {
      await admin.from("sales").update({ last_reconciled_at: new Date().toISOString() }).eq("id", saleId);
      try {
        await reconcileOnlineSale(saleId);
      } catch (err) {
        console.error("VERIFICAR VENTA: no se pudo reconciliar.", err);
      }
    }

    const { data: refreshed } = await admin.from("sales").select("status").eq("id", saleId).maybeSingle();
    return NextResponse.json({ ok: true, status: refreshed?.status ?? sale.status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("VERIFICAR VENTA:", error);
    return NextResponse.json({ error: "No pudimos verificar el pago. Intentá de nuevo en unos instantes." }, { status: 503 });
  }
}
