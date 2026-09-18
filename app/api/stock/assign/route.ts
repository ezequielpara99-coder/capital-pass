import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventProductId = String(body.eventProductId ?? "").trim();
    const barId = String(body.barId ?? "").trim();
    const quantity = Number(body.quantity);

    if (!eventProductId || !barId || !Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

    const { error } = await supabase.rpc("assign_stock_to_bar", {
      p_event_product_id: eventProductId,
      p_bar_id: barId,
      p_quantity: quantity,
    });

    if (error) {
      return NextResponse.json({ error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") || "No se pudo asignar el stock." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
