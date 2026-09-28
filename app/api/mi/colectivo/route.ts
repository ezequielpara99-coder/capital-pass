import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifySessionToken, CUSTOMER_SESSION_COOKIE } from "../../../../lib/customer/session";
import { trackingForIdentity } from "../../../../lib/traslados/tracking";

export const dynamic = "force-dynamic";

// Por donde va el colectivo del cliente logueado en /mi (por su email).
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value ?? "";
    const email = sessionCookie ? verifySessionToken(sessionCookie) : null;
    if (!email) return NextResponse.json({ error: "Tenés que iniciar sesión." }, { status: 401 });

    try {
      const routes = await trackingForIdentity(createAdminClient(), { email });
      return NextResponse.json({ ok: true, routes });
    } catch (error) {
      console.error("MI COLECTIVO:", error);
      return NextResponse.json({ ok: true, routes: [] });
    }
  } catch (error) {
    console.error("MI COLECTIVO:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
