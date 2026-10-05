import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { findStaffMember, resetStaffPassword } from "../../../../../lib/staff/reset-password";

const FALLBACK_ADMIN_EMAILS = ["ezequiel.para99@gmail.com"];

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "No hay una sesión válida." };

  const admin = createAdminClient();
  const { data: adminAccess } = await admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  const isFallbackAdmin = Boolean(user.email && FALLBACK_ADMIN_EMAILS.includes(user.email.toLowerCase()));

  if (!adminAccess && !isFallbackAdmin) return { ok: false as const, status: 403, error: "No tenés permiso." };
  return { ok: true as const };
}

// POST: el admin de la plataforma le genera una contraseña nueva a alguien
// del equipo de cualquier organizacion (RRPP, controlador, puerta, bartender).
export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json().catch(() => ({}));
    const memberId = String(body.memberId ?? "").trim();
    if (!memberId) return NextResponse.json({ error: "Falta la persona del equipo." }, { status: 400 });

    const admin = createAdminClient();
    const member = await findStaffMember(admin, memberId);
    if (!member) return NextResponse.json({ error: "No se encontró a esa persona del equipo." }, { status: 404 });

    const result = await resetStaffPassword(admin, member, { allowOtherOrganizations: true });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json({ ok: true, credentials: result.credentials });
  } catch (error) {
    console.error("ERROR POST ADMIN CONTRASEÑA EQUIPO:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
