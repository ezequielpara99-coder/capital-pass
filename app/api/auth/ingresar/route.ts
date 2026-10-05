import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { checkRateLimit, getClientIp } from "../../../../lib/http/rate-limit";

const INVALID = "Usuario o contraseña incorrectos.";

// POST { identifier, password }: inicio de sesion con email, nombre de
// usuario o celular. El servidor traduce el usuario/celular al email de la
// cuenta (cp_login_email) e inicia la sesion aca mismo -- el email nunca
// vuelve al navegador, asi que esto no sirve para averiguar el email de
// otra persona. Mismo mensaje generico para cualquier falla (igual que antes
// en /login): no se distingue "no existe" de "contraseña incorrecta".
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const identifier = String(body.identifier ?? "").trim().slice(0, 200);
    const password = String(body.password ?? "");
    if (!identifier || !password) {
      return NextResponse.json({ error: "Completá tu usuario y tu contraseña." }, { status: 400 });
    }

    // Por IP generoso (todo el equipo de un evento puede entrar desde el
    // mismo wifi) y por cuenta mas estricto, contra adivinar contraseñas.
    const ip = getClientIp(request);
    const allowed =
      (await checkRateLimit(`login-ip:${ip}`, 60, 300)) &&
      (await checkRateLimit(`login-id:${identifier.toLowerCase()}`, 10, 300));
    if (!allowed) {
      return NextResponse.json({ error: "Demasiados intentos. Esperá unos minutos y volvé a probar." }, { status: 429 });
    }

    let email: string | null = null;
    if (identifier.includes("@")) {
      email = identifier.toLowerCase();
    } else {
      const { data, error } = await createAdminClient().rpc("cp_login_email", { p_identifier: identifier });
      if (error) {
        // Si todavia no se corrio 20261018, el usuario/celular simplemente
        // no se reconoce (el email sigue funcionando).
        if (!/cp_login_email|schema cache|does not exist/i.test(error.message ?? "")) console.error("INGRESAR:", error);
      } else {
        email = (data as string | null) ?? null;
      }
    }
    if (!email) return NextResponse.json({ error: INVALID }, { status: 401 });

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return NextResponse.json({ error: INVALID }, { status: 401 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("INGRESAR:", error);
    return NextResponse.json({ error: "No se pudo iniciar sesión. Probá de nuevo." }, { status: 500 });
  }
}
