import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";

async function verifyOrganizer(userId: string) {
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return membership?.organization_id ?? null;
}

// Reclamos de la propia organizacion del organizador logueado.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

  const organizationId = await verifyOrganizer(user.id);
  if (!organizationId) return NextResponse.json({ error: "No tenés permiso." }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("complaints")
    .select("id, subject, message, status, admin_response, created_at, resolved_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("COMPLAINTS GET:", error);
    return NextResponse.json({ error: "No se pudieron cargar los reclamos." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, complaints: data ?? [] });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const subject = String(body.subject ?? "").trim();
    const message = String(body.message ?? "").trim();

    if (!subject || !message) {
      return NextResponse.json({ error: "Completá el asunto y el mensaje." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

    const organizationId = await verifyOrganizer(user.id);
    if (!organizationId) return NextResponse.json({ error: "No tenés permiso." }, { status: 403 });

    const admin = createAdminClient();
    const { data: complaint, error } = await admin
      .from("complaints")
      .insert({ organization_id: organizationId, created_by: user.id, subject, message })
      .select("id, subject, message, status, admin_response, created_at, resolved_at")
      .single();

    if (error || !complaint) return NextResponse.json({ error: "No se pudo enviar el reclamo." }, { status: 500 });
    return NextResponse.json({ ok: true, complaint }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
