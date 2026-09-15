import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { getAppBaseUrl } from "../../../lib/mercadopago/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (tokenHash && (type === "email" || type === "signup" || type === "recovery")) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      return NextResponse.redirect(
        `${getAppBaseUrl()}${type === "recovery" ? "/crear-contrasena" : "/cuenta"}`
      );
    }
  }
  return NextResponse.redirect(
    `${getAppBaseUrl()}${type === "recovery" ? "/recuperar-contrasena?error=1" : "/login?confirmacion=error"}`
  );
}
