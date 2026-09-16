import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { connectOrganization } from "../../../../../lib/mercadopago/oauth";
import { getAppBaseUrl } from "../../../../../lib/mercadopago/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const organizationId = request.nextUrl.searchParams.get("state");
  const failed = () => NextResponse.redirect(`${getAppBaseUrl()}/panel/cobros?error=1`);

  if (!code || !organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId)) return failed();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failed();

  // El state trae el organization_id, pero antes de guardar nada verificamos
  // que quien completo el OAuth sea efectivamente organizador activo de esa
  // organizacion -- si no, alguien podria intentar conectar su propia cuenta
  // de Mercado Pago a una organizacion ajena armando el link a mano.
  const admin = createAdminClient();
  const { data: membership } = await admin.from("organization_members")
    .select("id").eq("organization_id", organizationId).eq("user_id", user.id)
    .eq("role", "organizer").eq("status", "active").maybeSingle();
  if (!membership) return failed();

  try {
    await connectOrganization(organizationId, code);
  } catch {
    return failed();
  }

  return NextResponse.redirect(`${getAppBaseUrl()}/panel/cobros?conectado=1`);
}
