import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { reconcileOnlineSale } from "../../../../../../lib/billing/server";
import { validResourceId } from "../../../../../../lib/billing/rules";
import { checkRateLimit, getClientIp } from "../../../../../../lib/http/rate-limit";
import { createTicketPublicPath } from "../../../../../../lib/tickets/signature";
import { getAppBaseUrl } from "../../../../../../lib/mercadopago/server";

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
      // service_role no tiene permiso de UPDATE directo sobre sales (todas
      // las mutaciones pasan por funciones security definer) -- un
      // admin.from("sales").update(...) aca fallaba siempre con "permission
      // denied" sin que el codigo lo chequeara: last_reconciled_at nunca se
      // guardaba de verdad, asi que el cooldown de arriba nunca frenaba nada.
      await admin.rpc("set_sale_last_reconciled", { p_sale_id: saleId });
      try {
        await reconcileOnlineSale(saleId);
      } catch (err) {
        console.error("VERIFICAR VENTA: no se pudo reconciliar.", err);
      }
    }

    const { data: refreshed } = await admin.from("sales").select("status").eq("id", saleId).maybeSingle();
    const status = refreshed?.status ?? sale.status;

    // Confirmada: se devuelven los tickets (entradas o mesa) para que el
    // comprador los vea/comparta ahi mismo, sin depender solo del mail
    // (email es opcional en el checkout, puede no haber nada que mandarle).
    let tickets: { ticketId: string; manualCode: string | null; publicUrl: string }[] = [];
    if (status === "confirmed") {
      const { data: rows } = await admin
        .from("tickets")
        .select("id, manual_code")
        .eq("sale_id", saleId)
        .eq("status", "issued")
        .order("display_number", { ascending: true });
      const baseUrl = getAppBaseUrl();
      tickets = (rows ?? []).map((t) => ({
        ticketId: t.id as string,
        manualCode: t.manual_code as string | null,
        publicUrl: `${baseUrl}${createTicketPublicPath(t.id as string)}`,
      }));
    }

    return NextResponse.json({ ok: true, status, tickets }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("VERIFICAR VENTA:", error);
    return NextResponse.json({ error: "No pudimos verificar el pago. Intentá de nuevo en unos instantes." }, { status: 503 });
  }
}
