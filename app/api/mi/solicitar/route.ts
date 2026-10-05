import { NextRequest, NextResponse } from "next/server";
import { createLoginToken } from "../../../../lib/customer/session";
import { sendCustomerLoginLink } from "../../../../lib/email/customer-login";
import { getAppBaseUrl } from "../../../../lib/mercadopago/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { checkRateLimit, getClientIp } from "../../../../lib/http/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC = "Si ese email tiene entradas o membresía con nosotros, te llega un link para entrar.";

// Manda un link magico de acceso al portal del cliente (/mi). Siempre
// devuelve el mismo mensaje generico, exista o no ese email en la base --
// no hay forma de confirmar si alguien tiene cuenta o no desde afuera.
//
// Antes no tenia limite de intentos y le mandaba el mail a CUALQUIER
// direccion: servia para llenar de mails la casilla de un tercero con
// nuestro remitente (y gastar la cuota de Resend). Ahora hay limite por IP
// y por email, y el mail solo sale si ese email es de un comprador o de un
// socio -- la respuesta es la misma en todos los casos.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Ingresá un email válido." }, { status: 400 });

    const allowed =
      (await checkRateLimit(`mi-solicitar-ip:${getClientIp(request)}`, 10, 600)) &&
      (await checkRateLimit(`mi-solicitar-email:${email}`, 3, 900));
    if (!allowed) {
      return NextResponse.json({ error: "Ya te mandamos un link hace poco. Revisá tu correo (y el spam) o esperá unos minutos." }, { status: 429 });
    }

    const admin = createAdminClient();
    const [{ data: buyer }, { data: member }] = await Promise.all([
      admin.from("buyers").select("id").eq("email", email).limit(1).maybeSingle(),
      admin.from("premium_members").select("id").eq("email", email).is("deleted_at", null).limit(1).maybeSingle(),
    ]);
    if (!buyer && !member) return NextResponse.json({ ok: true, message: GENERIC });

    const token = createLoginToken(email);
    const loginUrl = `${getAppBaseUrl()}/api/mi/verificar?token=${encodeURIComponent(token)}`;

    const result = await sendCustomerLoginLink({ to: email, loginUrl });
    if (!result.ok && !result.skipped) {
      console.error("MI SOLICITAR:", result.error);
    }

    return NextResponse.json({ ok: true, message: GENERIC });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
