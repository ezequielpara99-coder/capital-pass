import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { authorizationUrl } from "../../../../../lib/mercadopago/oauth";
import { getAppBaseUrl } from "../../../../../lib/mercadopago/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "mp_oauth_csrf";

// Arranca la conexion OAuth con Mercado Pago. Genera un token aleatorio de
// un solo uso y lo guarda en una cookie HttpOnly junto con la organizacion
// para la que se esta conectando -- el callback exige que el "state" que
// vuelve de Mercado Pago coincida con esta cookie, asi nadie puede armar a
// mano un link de callback con el organization_id de otro organizador.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${getAppBaseUrl()}/login`);

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.redirect(`${getAppBaseUrl()}/panel`);
  }

  const csrfToken = randomBytes(24).toString("hex");
  const response = NextResponse.redirect(authorizationUrl(csrfToken));
  response.cookies.set(COOKIE_NAME, `${csrfToken}:${membership.organization_id}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/api/mercadopago/oauth",
  });
  return response;
}
