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

  // De paso, limpia los buckets del limitador de tasa (ver migracion
  // 20260950) mas viejos que la ventana mas larga que usamos (1 hora,
  // Rentals) -- si no, la tabla crece sin limite con una fila por
  // IP/endpoint que alguna vez hizo una request.
  const { error: rateLimitError } = await admin
    .from("rate_limit_buckets")
    .delete()
    .lt("window_start", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (rateLimitError) {
    console.error("CRON LIMPIEZA: no se pudieron limpiar los buckets de rate limit.", rateLimitError);
  }

  return NextResponse.json({ ok: true, cancelled: data ?? 0 });
}
