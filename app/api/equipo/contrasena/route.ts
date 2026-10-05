import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyOrganizerForOrg } from "../../../../lib/auth/organizer";
import { checkRateLimit } from "../../../../lib/http/rate-limit";
import { findStaffMember, resetStaffPassword } from "../../../../lib/staff/reset-password";

// POST: el organizador le genera una contraseña nueva a alguien de su equipo
// (RRPP, controlador, vendedor de puerta o bartender) que se la olvidó.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const memberId = String(body.memberId ?? "").trim();
    if (!memberId) return NextResponse.json({ error: "Falta la persona del equipo." }, { status: 400 });

    const admin = createAdminClient();

    // Primero la organizacion DUEÑA de la membresia, recien despues el
    // permiso (ver lib/auth/organizer.ts).
    const member = await findStaffMember(admin, memberId);
    if (!member) return NextResponse.json({ error: "No se encontró a esa persona del equipo." }, { status: 404 });

    const verification = await verifyOrganizerForOrg(member.organization_id);
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const allowed = await checkRateLimit(`staff-password:${verification.userId}`, 20, 3600);
    if (!allowed) return NextResponse.json({ error: "Demasiados cambios de contraseña seguidos. Probá en un rato." }, { status: 429 });

    const result = await resetStaffPassword(admin, member, { allowOtherOrganizations: false });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json({ ok: true, credentials: result.credentials });
  } catch (error) {
    console.error("ERROR POST CONTRASEÑA EQUIPO:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
