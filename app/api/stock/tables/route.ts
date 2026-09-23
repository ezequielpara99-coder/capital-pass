import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyOrganizerForEvent } from "../../../../lib/stock/auth";

// Lista de mesas de un evento. La puede ver el organizador o un RRPP
// activo asignado a ese evento -- ambos pueden vender mesas.
export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "Falta el evento." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

  const { data: event } = await supabase.from("events").select("id, organization_id").eq("id", eventId).maybeSingle();
  if (!event) return NextResponse.json({ error: "No se encontró el evento." }, { status: 404 });

  const { data: membership } = await supabase
    .from("organization_members")
    .select("id, role")
    .eq("organization_id", event.organization_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .in("role", ["organizer", "rrpp"])
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: "No tenés permiso para ver las mesas de este evento." }, { status: 403 });

  if (membership.role === "rrpp") {
    const { data: staff } = await supabase
      .from("event_staff")
      .select("id")
      .eq("event_id", eventId)
      .eq("organization_member_id", membership.id)
      .eq("staff_role", "rrpp")
      .eq("active", true)
      .maybeSingle();

    if (!staff) return NextResponse.json({ error: "No estás asignado como RRPP a este evento." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: tables, error } = await admin
    .from("bar_tables")
    .select("id, name, capacity, price_minor, status")
    .eq("event_id", eventId)
    .order("name");

  if (error) return NextResponse.json({ error: "No se pudieron cargar las mesas." }, { status: 500 });

  // price_minor es bigint: PostgREST lo devuelve como string -- sin
  // normalizar, una mesa con precio exactamente 0 queda truthy en JS y
  // el cliente (RRPP) muestra "$0" en vez de "Sin costo".
  const normalizedTables = (tables ?? []).map((table) => ({ ...table, price_minor: table.price_minor === null ? null : Number(table.price_minor) }));
  return NextResponse.json({ ok: true, tables: normalizedTables });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventId = String(body.eventId ?? "").trim();
    const name = String(body.name ?? "").trim();
    const capacity = body.capacity ? Math.max(1, Math.round(Number(body.capacity))) : null;
    const priceMinor = body.priceMinor ? Math.max(0, Math.round(Number(body.priceMinor))) : null;

    if (!eventId || !name) {
      return NextResponse.json({ error: "Ponele un nombre a la mesa." }, { status: 400 });
    }

    const verification = await verifyOrganizerForEvent(eventId);
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const admin = createAdminClient();
    const { data: table, error } = await admin
      .from("bar_tables")
      .insert({ event_id: eventId, name, capacity, price_minor: priceMinor })
      .select("id, name, capacity, price_minor, status")
      .single();

    if (error || !table) {
      return NextResponse.json({ error: "No se pudo crear la mesa." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, table: { ...table, price_minor: table.price_minor === null ? null : Number(table.price_minor) } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
