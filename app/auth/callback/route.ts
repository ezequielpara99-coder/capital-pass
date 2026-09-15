import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { getAppBaseUrl } from "../../../lib/mercadopago/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${getAppBaseUrl()}/cuenta`);
  }
  return NextResponse.redirect(`${getAppBaseUrl()}/login?confirmacion=error`);
}
