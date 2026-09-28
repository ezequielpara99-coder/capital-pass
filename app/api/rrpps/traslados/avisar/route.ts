import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { checkRateLimit } from "../../../../../lib/http/rate-limit";
import { notifyRouteProgress } from "../../../../../lib/traslados/notify";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST { routeId }: el colectivo cambio de parada (escaneo de un pasajero o
// "llegamos") -> avisa a los socios que lo estan esperando. Lo llama la
// pantalla de embarque del RRPP; solo el dueño del colectivo o el organizador.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const routeId = String(body.routeId ?? "");
    if (!UUID.test(routeId)) return NextResponse.json({ error: "Colectivo inválido." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

    if (!(await checkRateLimit(`avisar-colectivo:${user.id}`, 60, 60))) {
      return NextResponse.json({ error: "Demasiados intentos." }, { status: 429 });
    }

    const admin = createAdminClient();
    const { data: route } = await admin
      .from("transfer_routes")
      .select("id, event_id, organization_member_id")
      .eq("id", routeId)
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (!route) return NextResponse.json({ error: "No se encontró el colectivo." }, { status: 404 });

    const { data: event } = await admin.from("events").select("organization_id").eq("id", route.event_id).maybeSingle();
    if (!event) return NextResponse.json({ error: "No se encontró el evento." }, { status: 404 });

    // Dueño del recurso primero, despues el rol de quien llama sobre esa organizacion.
    const { data: memberships } = await admin
      .from("organization_members")
      .select("id, role")
      .eq("user_id", user.id)
      .eq("organization_id", event.organization_id)
      .eq("status", "active");

    const isOrganizer = (memberships ?? []).some((m) => m.role === "organizer");
    const isOwner = (memberships ?? []).some((m) => m.role === "rrpp" && m.id === route.organization_member_id);
    if (!isOrganizer && !isOwner) return NextResponse.json({ error: "No tenés acceso a este colectivo." }, { status: 403 });

    // El envio corre despues de responder: el RRPP no espera a los avisos.
    after(async () => {
      try {
        await notifyRouteProgress(routeId);
      } catch (error) {
        console.error("AVISOS COLECTIVO:", error instanceof Error ? error.message : error);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("AVISOS COLECTIVO:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
