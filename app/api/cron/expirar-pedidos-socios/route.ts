import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Corre cada 30 minutos (ver vercel.json). Un pedido de barra de un socio
// que quedo "pending" mas de 6 horas -- nadie lo marco listo, entregado ni
// cancelado -- se cancela solo y se reembolsa el saldo/puntos descontados.
// Una reserva de mesa a pagar en el lugar recien se libera cuando el evento
// ya paso, y una mesa pagada con saldo nunca se cancela sola (ver
// 20261017_recargas_repetidas_y_mesas_de_socio.sql).
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
