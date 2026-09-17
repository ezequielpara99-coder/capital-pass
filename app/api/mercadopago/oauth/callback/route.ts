import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { connectOrganization } from "../../../../../lib/mercadopago/oauth";
import { getAppBaseUrl } from "../../../../../lib/mercadopago/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "mp_oauth_csrf";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const mpError = request.nextUrl.searchParams.get("error");
  const failed = (reason: string) => {
    const response = NextResponse.redirect(`${getAppBaseUrl()}/panel/cobros?error=${encodeURIComponent(reason)}`);
    response.cookies.delete({ name: COOKIE_NAME, path: "/api/mercadopago/oauth" });
    return response;
  };

  if (mpError) return failed(`Mercado Pago: ${mpError}`);
  if (!code) return failed("Falta el codigo de autorizacion en la respuesta de Mercado Pago.");
  if (!state) return failed("Falta el parametro state en la respuesta de Mercado Pago.");

  // El "state" que vuelve de Mercado Pago tiene que coincidir con el token
  // que guardamos en una cookie propia cuando arrancamos este flow (ver
  // /api/mercadopago/oauth/start). Sin esto, alguien podria armar a mano un
  // link de callback con el organization_id de otro organizador y un
  // "code" propio, y terminar conectando SU cuenta de Mercado Pago a la
  // organizacion de otro -- el organization_id NUNCA sale del query string,
  // sale de esta cookie.
  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  const [csrfToken, organizationId] = cookieValue?.split(":") ?? [];
  if (!csrfToken || !organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId)) {
    return failed("El enlace de conexión venció o ya se usó. Volvé a intentar desde Cobros.");
  }
  if (state !== csrfToken) {
    return failed("El enlace de conexión no es válido.");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failed("No hay una sesion de Capital Pass activa en este navegador.");

  // Defensa en profundidad: ademas del CSRF token, confirmamos que quien
  // completo el OAuth sigue siendo organizador activo de esa organizacion.
  const admin = createAdminClient();
  const { data: membership } = await admin.from("organization_members")
    .select("id").eq("organization_id", organizationId).eq("user_id", user.id)
    .eq("role", "organizer").eq("status", "active").maybeSingle();
  if (!membership) return failed(`El usuario logueado (${user.email}) no es organizador activo de esa organizacion.`);

  try {
    await connectOrganization(organizationId, code);
  } catch (error) {
    return failed(`No se pudo canjear el codigo con Mercado Pago: ${error instanceof Error ? error.message : "error desconocido"}`);
  }

  const response = NextResponse.redirect(`${getAppBaseUrl()}/panel/cobros?conectado=1`);
  response.cookies.delete({ name: COOKIE_NAME, path: "/api/mercadopago/oauth" });
  return response;
}
