import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { verifyMemberSignature } from "../../../../../lib/members/signature";
import { checkRateLimit, getClientIp } from "../../../../../lib/http/rate-limit";
import { trackingForIdentity } from "../../../../../lib/traslados/tracking";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ memberId: string }> };

// Por donde va el colectivo de este socio (si tiene pasaje de traslado en un
// evento proximo). Se identifica por el email/DNI/telefono de su carnet.
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { memberId } = await context.params;
    const signature = request.nextUrl.searchParams.get("s") ?? "";
    if (!signature || !verifyMemberSignature(memberId, signature)) {
      return NextResponse.json({ error: "Link inválido." }, { status: 404 });
    }
    if (!(await checkRateLimit(`socio-colectivo:${getClientIp(request)}`, 60, 60))) {
      return NextResponse.json({ error: "Demasiados intentos, esperá un momento." }, { status: 429 });
    }

    const admin = createAdminClient();
    const { data: member } = await admin
      .from("premium_members")
      .select("organization_id, email, dni, phone")
      .eq("id", memberId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: "Socio no encontrado." }, { status: 404 });

    try {
      const routes = await trackingForIdentity(admin, { organizationId: member.organization_id, email: member.email, dni: member.dni, phone: member.phone });
      return NextResponse.json({ ok: true, routes });
    } catch (error) {
      // Si todavia no se aplico la migracion del seguimiento, la app sigue funcionando sin la tarjeta.
      console.error("SOCIO COLECTIVO:", error);
      return NextResponse.json({ ok: true, routes: [] });
    }
  } catch (error) {
    console.error("SOCIO COLECTIVO:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
