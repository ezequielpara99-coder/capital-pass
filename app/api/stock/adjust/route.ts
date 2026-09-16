import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const barId = String(body.barId ?? "").trim();
    const eventProductId = String(body.eventProductId ?? "").trim();
    const quantityDelta = Number(body.quantityDelta);
    const type = body.type === "ajuste" ? "ajuste" : "perdida";
    const reason = String(body.reason ?? "").trim();

    if (!barId || !eventProductId || !Number.isInteger(quantityDelta) || quantityDelta === 0 || !reason) {
      return NextResponse.json({ error: "Completá la cantidad y el motivo." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

    const { error } = await supabase.rpc("adjust_bar_stock", {
      p_bar_id: barId,
      p_event_product_id: eventProductId,
      p_quantity_delta: quantityDelta,
      p_type: type,
      p_reason: reason,
    });

    if (error) {
      return NextResponse.json({ error: error.message.replace(/^.*?:\s*/, "") || "No se pudo ajustar el stock." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
