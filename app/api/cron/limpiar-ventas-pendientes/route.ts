import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Corre cada 10 minutos (ver vercel.json). Libera el cupo reservado por
// carritos online que nunca terminaron de pagarse.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("cp_cancel_stale_online_sales");

  if (error) {
    console.error("CRON LIMPIEZA: no se pudo cancelar ventas pendientes.", error);
    return NextResponse.json({ error: "No se pudo limpiar." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cancelled: data ?? 0 });
}
