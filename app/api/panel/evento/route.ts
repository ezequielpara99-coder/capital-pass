import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { SELECTED_EVENT_COOKIE } from "../../../../lib/panel/selected-event";

// Guarda que evento esta administrando el organizador. Solo se puede elegir
// un evento de la organizacion donde es organizador activo.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventId = String(body.eventId ?? "").trim();
    if (!eventId) return NextResponse.json({ error: "Falta el evento." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

    const { data: event } = await supabase.from("events").select("id, organization_id").eq("id", eventId).maybeSingle();
    if (!event) return NextResponse.json({ error: "No se encontró el evento." }, { status: 404 });

    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", event.organization_id)
      .eq("user_id", user.id)
      .eq("role", "organizer")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership) return NextResponse.json({ error: "No tenés permiso sobre este evento." }, { status: 403 });

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: SELECTED_EVENT_COOKIE,
      value: event.id,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
