import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

// Vende/reserva una mesa. Lo puede hacer el organizador o un RRPP
// asignado al evento -- el permiso lo valida la propia funcion sell_table.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventId = String(body.eventId ?? "").trim();
    const tableId = String(body.tableId ?? "").trim();
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const dni = String(body.dni ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const paymentMethod = String(body.paymentMethod ?? "").trim();

    if (!eventId || !tableId || !firstName || !lastName || !phone || !paymentMethod) {
      return NextResponse.json({ error: "Completá los datos del comprador." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

    const { data, error } = await supabase.rpc("sell_table", {
      p_event_id: eventId,
      p_table_id: tableId,
      p_buyer_first_name: firstName,
      p_buyer_last_name: lastName,
      p_buyer_dni: dni || null,
      p_buyer_phone: phone,
      p_payment_method: paymentMethod,
    });

    if (error) {
      return NextResponse.json({ error: error.message.replace(/^.*?:\s*/, "") || "No se pudo vender la mesa." }, { status: 400 });
    }

    const result = data?.[0];
    return NextResponse.json({ ok: true, saleId: result?.sale_id, totalMinor: result?.total_minor });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
