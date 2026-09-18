import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const saleId = String(body.saleId ?? "").trim();
    const reason = String(body.reason ?? "").trim();

    if (!saleId || !reason) {
      return NextResponse.json({ error: "Indicá el motivo de la cancelación." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

    const { error } = await supabase.rpc("cancel_bar_sale", { p_sale_id: saleId, p_reason: reason });

    if (error) {
      return NextResponse.json({ error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") || "No se pudo cancelar la venta." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
