import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { getAppBaseUrl } from "../../../lib/mercadopago/server";

// Nombre de la marca de un solo uso que le avisa a /crear-contrasena que
// esta sesion viene de ahi haber verificado un link de recuperacion real,
// y no de cualquier sesion ya abierta en el dispositivo (ver el comentario
// en app/crear-contrasena/page.tsx). No es HttpOnly a proposito: la tiene
// que poder leer y borrar el componente de cliente.
const RECOVERY_MARKER_COOKIE = "cp_recovery_ok";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (tokenHash && (type === "email" || type === "signup" || type === "recovery")) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      if (type === "recovery") {
        const response = NextResponse.redirect(`${getAppBaseUrl()}/crear-contrasena`);
        response.cookies.set(RECOVERY_MARKER_COOKIE, "1", {
          secure: true,
          sameSite: "lax",
          maxAge: 120,
          path: "/",
        });
        return response;
      }
      return NextResponse.redirect(`${getAppBaseUrl()}/cuenta`);
    }
  }
  return NextResponse.redirect(
    `${getAppBaseUrl()}${type === "recovery" ? "/recuperar-contrasena?error=1" : "/login?confirmacion=error"}`
  );
}
