import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = "id, event_id, organization_member_id, name, departure_at, departure_location, capacity, is_paid, price_minor, active, created_at";

function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}

// Resuelve el evento PRIMERO (dueño del recurso) y recien despues el rol
// del usuario que llama sobre esa organizacion/evento puntual -- mismo
// criterio que getOrganizerContext en /api/rrpps. Devuelve isOrganizer
// (acceso total) o, si no, el organization_member_id del RRPP activo para
// ESE evento (acceso solo a sus propios colectivos).
async function resolveCaller(eventId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No hay una sesión válida.", status: 401 } as const;

  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("id, organization_id").eq("id", eventId).maybeSingle();
  if (!event) return { error: "El evento no existe.", status: 404 } as const;

  const { data: organizerMembership } = await admin
    .from("organization_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("organization_id", event.organization_id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (organizerMembership) return { admin, isOrganizer: true as const, memberId: null };

  const { data: rrppMembership } = await admin
    .from("organization_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("organization_id", event.organization_id)
    .eq("role", "rrpp")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (rrppMembership) {
    const { data: staff } = await admin
      .from("event_staff")
      .select("organization_member_id")
      .eq("event_id", eventId)
      .eq("organization_member_id", rrppMembership.id)
      .eq("staff_role", "rrpp")
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (staff) return { admin, isOrganizer: false as const, memberId: staff.organization_member_id as string };
  }

  return { error: "No tenés acceso a este evento.", status: 403 } as const;
}

function normalizePrice(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.round(number), 1_000_000_000) : 0;
}

// GET: lista los colectivos de un evento (?eventId=). El organizador ve
// todos; un RRPP solo ve los suyos y los generales (sin dueño).
export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get("eventId") ?? "";
    if (!UUID.test(eventId)) return NextResponse.json({ error: "Evento inválido." }, { status: 400 });

    const caller = await resolveCaller(eventId);
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    let query = caller.admin.from("transfer_routes").select(FIELDS).eq("event_id", eventId).order("created_at", { ascending: true });
    if (!caller.isOrganizer) query = query.or(`organization_member_id.eq.${caller.memberId},organization_member_id.is.null`);
    const { data, error } = await query;

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (traslados)." }, { status: 503 });
      console.error("TRASLADOS GET:", error);
      return NextResponse.json({ error: "No se pudieron cargar los colectivos." }, { status: 500 });
    }

    const routes = (data ?? []).map((r) => ({ ...r, capacity: r.capacity === null ? null : Number(r.capacity), price_minor: Number(r.price_minor) }));
    return NextResponse.json({ ok: true, routes, isOrganizer: caller.isOrganizer });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// POST: crea un colectivo (solo organizador).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventId = String(body.eventId ?? "");
    if (!UUID.test(eventId)) return NextResponse.json({ error: "Evento inválido." }, { status: 400 });

    const caller = await resolveCaller(eventId);
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });
    if (!caller.isOrganizer) return NextResponse.json({ error: "Solo el organizador puede crear colectivos." }, { status: 403 });

    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Ingresá un nombre para el colectivo." }, { status: 400 });

    const organizationMemberId = String(body.organizationMemberId ?? "").trim();
    if (organizationMemberId && !UUID.test(organizationMemberId)) return NextResponse.json({ error: "RRPP inválido." }, { status: 400 });

    const isPaid = Boolean(body.isPaid);
    const capacity = body.capacity !== undefined && String(body.capacity).trim() !== "" ? Math.max(1, Math.round(Number(body.capacity))) : null;

    const { data, error } = await caller.admin
      .from("transfer_routes")
      .insert({
        event_id: eventId,
        organization_member_id: organizationMemberId || null,
        name: name.slice(0, 200),
        departure_at: body.departureAt || null,
        departure_location: String(body.departureLocation ?? "").trim().slice(0, 200) || null,
        capacity,
        is_paid: isPaid,
        price_minor: isPaid ? normalizePrice(body.priceMinor) : 0,
      })
      .select(FIELDS)
      .single();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (traslados)." }, { status: 503 });
      console.error("TRASLADOS POST:", error);
      return NextResponse.json({ error: "No se pudo crear el colectivo." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, route: { ...data, capacity: data.capacity === null ? null : Number(data.capacity), price_minor: Number(data.price_minor) } });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH: edita/activa/desactiva un colectivo (solo organizador). Body: { id, eventId, ...campos }.
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = String(body.id ?? "");
    const eventId = String(body.eventId ?? "");
    if (!UUID.test(id) || !UUID.test(eventId)) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

    const caller = await resolveCaller(eventId);
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });
    if (!caller.isOrganizer) return NextResponse.json({ error: "Solo el organizador puede editar colectivos." }, { status: 403 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: "Ingresá un nombre para el colectivo." }, { status: 400 });
      updates.name = name.slice(0, 200);
    }
    if (body.organizationMemberId !== undefined) {
      const organizationMemberId = String(body.organizationMemberId ?? "").trim();
      if (organizationMemberId && !UUID.test(organizationMemberId)) return NextResponse.json({ error: "RRPP inválido." }, { status: 400 });
      updates.organization_member_id = organizationMemberId || null;
    }
    if (body.departureAt !== undefined) updates.departure_at = body.departureAt || null;
    if (body.departureLocation !== undefined) updates.departure_location = String(body.departureLocation).trim().slice(0, 200) || null;
    if (body.capacity !== undefined) updates.capacity = String(body.capacity).trim() !== "" ? Math.max(1, Math.round(Number(body.capacity))) : null;
    if (body.isPaid !== undefined) updates.is_paid = Boolean(body.isPaid);
    if (body.priceMinor !== undefined) updates.price_minor = updates.is_paid === false ? 0 : normalizePrice(body.priceMinor);
    if (body.active !== undefined) updates.active = Boolean(body.active);

    const { data, error } = await caller.admin.from("transfer_routes").update(updates).eq("id", id).eq("event_id", eventId).select(FIELDS).maybeSingle();

    if (error) {
      console.error("TRASLADOS PATCH:", error);
      return NextResponse.json({ error: "No se pudo guardar el colectivo." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el colectivo." }, { status: 404 });

    return NextResponse.json({ ok: true, route: { ...data, capacity: data.capacity === null ? null : Number(data.capacity), price_minor: Number(data.price_minor) } });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE: borra un colectivo (solo organizador, solo si nunca sumo pasajeros).
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id") ?? "";
    const eventId = request.nextUrl.searchParams.get("eventId") ?? "";
    if (!UUID.test(id) || !UUID.test(eventId)) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

    const caller = await resolveCaller(eventId);
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });
    if (!caller.isOrganizer) return NextResponse.json({ error: "Solo el organizador puede borrar colectivos." }, { status: 403 });

    const { count } = await caller.admin.from("transfer_tickets").select("id", { count: "exact", head: true }).eq("route_id", id);
    if (count && count > 0) {
      return NextResponse.json({ error: "Este colectivo ya tiene pasajeros -- desactivalo en vez de borrarlo." }, { status: 409 });
    }

    const { error } = await caller.admin.from("transfer_routes").delete().eq("id", id).eq("event_id", eventId);
    if (error) {
      console.error("TRASLADOS DELETE:", error);
      return NextResponse.json({ error: "No se pudo borrar el colectivo." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
