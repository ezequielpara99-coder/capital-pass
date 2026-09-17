import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

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

// PATCH: marcar un reclamo como resuelto (con o sin respuesta para el organizador).
export async function PATCH(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const complaintId = String(body.complaintId ?? "").trim();
    const adminResponse = body.adminResponse ? String(body.adminResponse).trim() : null;

    if (!complaintId) return NextResponse.json({ error: "Falta el reclamo." }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin
      .from("complaints")
      .update({ status: "resuelto", admin_response: adminResponse, resolved_at: new Date().toISOString() })
      .eq("id", complaintId);

    if (error) return NextResponse.json({ error: "No se pudo actualizar el reclamo." }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
