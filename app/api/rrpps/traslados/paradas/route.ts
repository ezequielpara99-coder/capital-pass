import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { planStopChanges } from "../../../../../lib/traslados/stops";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PUT { eventId, routeId, stops: string[] }: define las paradas (localidades,
// en orden) de un colectivo. Solo el organizador del evento. Los pasajeros
// conservan su parada aunque se reordene, se agregue una en el medio o se
// corrija un nombre (ver el emparejamiento por nombre mas abajo).
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const eventId = String(body.eventId ?? "");
    const routeId = String(body.routeId ?? "");
    if (!UUID.test(eventId) || !UUID.test(routeId)) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

    const names: string[] = (Array.isArray(body.stops) ? body.stops : [])
      .map((s: unknown) => String(s ?? "").trim().slice(0, 80))
      .filter((s: string) => s.length > 0);
    if (names.length > 40) return NextResponse.json({ error: "Máximo 40 paradas por colectivo." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

    const admin = createAdminClient();
    const { data: event } = await admin.from("events").select("organization_id").eq("id", eventId).maybeSingle();
    if (!event) return NextResponse.json({ error: "El evento no existe." }, { status: 404 });

    const { data: membership } = await admin
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", event.organization_id)
      .eq("role", "organizer")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership) return NextResponse.json({ error: "Solo el organizador puede definir las paradas." }, { status: 403 });

    const { data: route } = await admin.from("transfer_routes").select("id").eq("id", routeId).eq("event_id", eventId).is("deleted_at", null).maybeSingle();
    if (!route) return NextResponse.json({ error: "No se encontró el colectivo." }, { status: 404 });

    const { data: existing, error: existingError } = await admin
      .from("transfer_route_stops")
      .select("id, position, name")
      .eq("route_id", routeId)
      .order("position", { ascending: true });
    if (existingError) {
      if (/does not exist|schema cache/i.test(existingError.message ?? "")) {
        return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (seguimiento del colectivo)." }, { status: 503 });
      }
      console.error("PARADAS:", existingError);
      return NextResponse.json({ error: "No se pudieron guardar las paradas." }, { status: 500 });
    }

    // Los pasajeros conservan su parada aunque se reordene, se agregue una
    // en el medio o se corrija un nombre (ver lib/traslados/stops.ts).
    const { assigned, removed } = planStopChanges(
      (existing ?? []).map((s) => ({ id: s.id as string, name: String(s.name ?? "") })),
      names
    );

    const fail = (error: unknown) => {
      console.error("PARADAS:", error);
      return NextResponse.json({ error: "No se pudieron guardar las paradas." }, { status: 500 });
    };

    // 1) Las que se borran (sus pasajeros quedan sin parada: on delete set null).
    if (removed.length > 0) {
      const deleted = await admin.from("transfer_route_stops").delete().in("id", removed);
      if (deleted.error) return fail(deleted.error);
    }

    // 2) Las que se conservan se corren a posiciones temporales (unique
    //    route_id+position), 3) despues a su posicion y nombre final.
    for (let i = 0; i < names.length; i++) {
      const id = assigned[i];
      if (!id) continue;
      const moved = await admin.from("transfer_route_stops").update({ position: 1000 + i + 1 }).eq("id", id);
      if (moved.error) return fail(moved.error);
    }
    for (let i = 0; i < names.length; i++) {
      const id = assigned[i];
      const result = id
        ? await admin.from("transfer_route_stops").update({ position: i + 1, name: names[i] }).eq("id", id)
        : await admin.from("transfer_route_stops").insert({ route_id: routeId, position: i + 1, name: names[i] });
      if (result.error) return fail(result.error);
    }

    const { data: stops } = await admin.from("transfer_route_stops").select("id, position, name").eq("route_id", routeId).order("position", { ascending: true });
    return NextResponse.json({ ok: true, stops: (stops ?? []).map((s) => ({ ...s, position: Number(s.position) })) });
  } catch (error) {
    console.error("PARADAS:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
