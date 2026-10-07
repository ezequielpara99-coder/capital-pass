import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Corre cada 10 minutos (ver vercel.json). Pasa los eventos a "Activo" 6 h
// antes del inicio (sin eso la puerta no puede escanear ni vender) y a
// "Finalizado" 12 h despues del cierre. Cada cambio automatico se hace una
// sola vez por evento: si el organizador despues lo cambia a mano, se
// respeta (ver migracion 20261023).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("cp_auto_event_status");

  if (error) {
    console.error("CRON ESTADO EVENTOS: no se pudo actualizar el estado.", error);
    return NextResponse.json({ error: "No se pudo actualizar el estado de los eventos." }, { status: 500 });
  }

  const row = (data as { activated: number; finished: number }[] | null)?.[0];
  return NextResponse.json({ ok: true, activated: row?.activated ?? 0, finished: row?.finished ?? 0 });
}
