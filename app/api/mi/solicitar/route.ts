import { NextRequest, NextResponse } from "next/server";
import { createLoginToken } from "../../../../lib/customer/session";
import { sendCustomerLoginLink } from "../../../../lib/email/customer-login";
import { getAppBaseUrl } from "../../../../lib/mercadopago/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Manda un link magico de acceso al portal del cliente (/mi). Siempre
// devuelve el mismo mensaje generico, exista o no ese email en la base --
// no hay forma de confirmar si alguien tiene cuenta o no desde afuera.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Ingresá un email válido." }, { status: 400 });

    const token = createLoginToken(email);
    const loginUrl = `${getAppBaseUrl()}/api/mi/verificar?token=${encodeURIComponent(token)}`;

    const result = await sendCustomerLoginLink({ to: email, loginUrl });
    if (!result.ok && !result.skipped) {
      console.error("MI SOLICITAR:", result.error);
    }

    return NextResponse.json({ ok: true, message: "Si ese email tiene entradas o membresía con nosotros, te llega un link para entrar." });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
