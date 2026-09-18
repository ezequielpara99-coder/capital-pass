import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { sendPushToOrganizers } from "../../../../../lib/push/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const barId = String(body.barId ?? "").trim();
    const manualCode = String(body.manualCode ?? "").trim();
    const eventProductId = String(body.eventProductId ?? "").trim();
    const quantity = Number(body.quantity);

    if (!barId || !manualCode || !eventProductId || !Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

    const { data, error } = await supabase.rpc("redeem_combo_ticket", {
      p_bar_id: barId,
      p_manual_code: manualCode,
      p_event_product_id: eventProductId,
      p_quantity: quantity,
    });

    if (error) {
      return NextResponse.json({ error: error.message.replace(/^.*?:\s*/, "") || "No se pudo canjear el combo." }, { status: 400 });
    }

    const row = data?.[0];
    if (!row) return NextResponse.json({ error: "No se pudo canjear el combo." }, { status: 500 });

    // Best-effort: avisar al organizador, igual que una venta de barra normal.
    try {
      const admin = createAdminClient();
      const { data: bar } = await admin.from("bars").select("event_id, name").eq("id", barId).maybeSingle();
      if (bar) {
        const { data: event } = await admin.from("events").select("organization_id").eq("id", bar.event_id).maybeSingle();
        if (event) {
          await sendPushToOrganizers(event.organization_id, "bar_sale", {
            title: "🎟️ Combo canjeado",
            body: `${row.buyer_name}: ${row.quantity} ${row.product_name} en ${bar.name}`,
            url: "/panel/stock",
          });
        }
      }
    } catch (err) {
      console.error("COMBO REDEEM push:", err);
    }

    return NextResponse.json({
      ok: true,
      receipt: {
        ticketId: row.ticket_id,
        productName: row.product_name,
        quantity: row.quantity,
        remainingQuantity: row.remaining_quantity,
        remainingCreditMinor: row.remaining_credit_minor,
        buyerName: row.buyer_name,
      },
    });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
