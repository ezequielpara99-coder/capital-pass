import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verifyOrganizerForRoute(eventId: string, routeId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "No hay una sesión válida." };

  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("organization_id").eq("id", eventId).maybeSingle();
  if (!event) return { ok: false as const, status: 404, error: "El evento no existe." };

  const { data: membership } = await admin
    .from("organization_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("organization_id", event.organization_id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) return { ok: false as const, status: 403, error: "Solo el organizador puede administrar los pasajeros." };

  const { data: route } = await admin.from("transfer_routes").select("id").eq("id", routeId).eq("event_id", eventId).is("deleted_at", null).maybeSingle();
  if (!route) return { ok: false as const, status: 404, error: "No se encontró el colectivo." };

  return { ok: true as const, admin };
}

// GET ?eventId&routeId: lista los pasajeros de un colectivo (solo el
// organizador del evento). Usado por el panel de traslados para poder
// cancelar un pasaje.
export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get("eventId") ?? "";
    const routeId = request.nextUrl.searchParams.get("routeId") ?? "";
    if (!UUID.test(eventId) || !UUID.test(routeId)) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

    const verification = await verifyOrganizerForRoute(eventId, routeId);
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { data: passengers, error } = await verification.admin
      .from("transfer_tickets")
      .select("id, passenger_name, passenger_phone, manual_code, status, stop_id, created_at")
      .eq("route_id", routeId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("TRASLADOS PASAJEROS GET:", error);
      return NextResponse.json({ error: "No se pudieron cargar los pasajeros." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, passengers: passengers ?? [] });
  } catch (error) {
    console.error("TRASLADOS PASAJEROS GET:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// POST { eventId, routeId, ticketId, reason }: cancela un pasaje todavia sin
// usar. Llama a cancel_transfer_ticket con la sesion del organizador (no con
// el cliente admin) para que la funcion pueda validar auth.uid() como
// siempre.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventId = String(body.eventId ?? "");
    const routeId = String(body.routeId ?? "");
    const ticketId = String(body.ticketId ?? "");
    const reason = body.reason ? String(body.reason).trim().slice(0, 200) : null;
    if (!UUID.test(eventId) || !UUID.test(routeId) || !UUID.test(ticketId)) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }

    const verification = await verifyOrganizerForRoute(eventId, routeId);
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { data: ticket } = await verification.admin.from("transfer_tickets").select("id").eq("id", ticketId).eq("route_id", routeId).maybeSingle();
    if (!ticket) return NextResponse.json({ error: "No se encontró el pasaje." }, { status: 404 });

    const supabase = await createClient();
    const { error } = await supabase.rpc("cancel_transfer_ticket", { p_ticket_id: ticketId, p_reason: reason });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("TRASLADOS PASAJEROS POST:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
