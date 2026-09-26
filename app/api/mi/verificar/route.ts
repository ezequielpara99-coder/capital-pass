import { NextRequest, NextResponse } from "next/server";
import { verifyLoginToken, createSessionToken, CUSTOMER_SESSION_COOKIE, CUSTOMER_SESSION_MAX_AGE_SECONDS } from "../../../../lib/customer/session";

// Cambia el link magico (de un solo uso, 15 min) por una cookie de sesion
// de 30 dias -- asi /mi funciona como una app propia que el cliente puede
// volver a abrir despues, no solo un link que se usa una vez.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const email = verifyLoginToken(token);

  if (!email) {
    return NextResponse.redirect(new URL("/mi?error=vencido", request.url));
  }

  const response = NextResponse.redirect(new URL("/mi", request.url));
  response.cookies.set(CUSTOMER_SESSION_COOKIE, createSessionToken(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CUSTOMER_SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
