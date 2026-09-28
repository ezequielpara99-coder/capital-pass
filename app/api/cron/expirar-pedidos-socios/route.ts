import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Corre cada 30 minutos (ver vercel.json). Un pedido de socio (consumo o
// reserva de mesa) que quedo "pending" mas de 6 horas -- nadie lo marco
// listo, entregado ni cancelado -- se cancela solo: se reembolsa el saldo/
// puntos que se hayan descontado y, si era una mesa, se libera para que
// otro la pueda reservar. Antes esto no pasaba nunca: una mesa reservada sin
// seguimiento quedaba trabada para siempre.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("cp_expire_stale_member_orders", { p_hours: 6 });

  if (error) {
    console.error("CRON EXPIRAR PEDIDOS SOCIOS:", error);
    return NextResponse.json({ error: "No se pudo limpiar." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cancelled: data ?? 0 });
}
