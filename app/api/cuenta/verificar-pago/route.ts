import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { reconcileUser } from "../../../../lib/billing/server";
import { getAppBaseUrl } from "../../../../lib/mercadopago/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(getAppBaseUrl()).origin) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesion nuevamente." }, { status: 401 });
  try {
    const account = await reconcileUser(user);
    return NextResponse.json({ active: account.active, destination: account.destination, mpStatus: account.signup?.mp_status ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Todavia no pudimos confirmar el pago. No vuelvas a pagar; reintenta en unos instantes." }, { status: 503 });
  }
}
