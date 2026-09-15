import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { getAppBaseUrl } from "../../../lib/mercadopago/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (tokenHash && (type === "email" || type === "signup")) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${getAppBaseUrl()}/cuenta`);
  }
  return NextResponse.redirect(`${getAppBaseUrl()}/login?confirmacion=error`);
}
