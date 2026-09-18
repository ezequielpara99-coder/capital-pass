import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

// Los packs son una funcion de venta de entradas, no del modulo de stock
// -- a proposito NO exige cp_org_has_stock_access (eso es para stock/
// barras). Solo hace falta ser organizador activo del evento.
async function verifyOrganizer(eventId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "No hay una sesión válida." };

  const { data: event } = await supabase.from("events").select("id, organization_id").eq("id", eventId).maybeSingle();
  if (!event) return { ok: false as const, status: 404, error: "No se encontró el evento." };

  const { data: membership } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", event.organization_id)
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) return { ok: false as const, status: 403, error: "No tenés permiso para administrar este evento." };

  return { ok: true as const };
}

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "Falta el evento." }, { status: 400 });

  const verification = await verifyOrganizer(eventId);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const admin = createAdminClient();
  const { data: packs, error } = await admin
    .from("ticket_packs")
    .select("id, name, ticket_type_id, quantity_per_pack, price_minor, currency, active, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("STOCK PACKS GET:", error);
    return NextResponse.json({ error: "No se pudieron cargar los packs." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, packs: packs ?? [] });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventId = String(body.eventId ?? "").trim();
    const ticketTypeId = String(body.ticketTypeId ?? "").trim();
    const name = String(body.name ?? "").trim();
    const quantityPerPack = Number(body.quantityPerPack);
    const priceMinor = Number(body.priceMinor);

    if (!eventId) return NextResponse.json({ error: "Falta el evento." }, { status: 400 });
    const verification = await verifyOrganizer(eventId);
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    if (!ticketTypeId || !name) return NextResponse.json({ error: "Completá el nombre y la tanda del pack." }, { status: 400 });
    if (!Number.isInteger(quantityPerPack) || quantityPerPack <= 1) {
      return NextResponse.json({ error: "La cantidad por pack tiene que ser 2 o más." }, { status: 400 });
    }
    if (!Number.isInteger(priceMinor) || priceMinor <= 0) {
      return NextResponse.json({ error: "Ingresá un precio válido para el pack." }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: ticketType } = await admin
      .from("ticket_types")
      .select("id")
      .eq("id", ticketTypeId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (!ticketType) return NextResponse.json({ error: "La tanda no existe para este evento." }, { status: 400 });

    const { data: pack, error } = await admin
      .from("ticket_packs")
      .insert({ event_id: eventId, ticket_type_id: ticketTypeId, name, quantity_per_pack: quantityPerPack, price_minor: priceMinor })
      .select("id, name, ticket_type_id, quantity_per_pack, price_minor, currency, active, created_at")
      .single();

    if (error) {
      console.error("STOCK PACKS POST:", error);
      return NextResponse.json({ error: "No se pudo crear el pack." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, pack });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const eventId = String(body.eventId ?? "").trim();
    const packId = String(body.packId ?? "").trim();
    if (!eventId || !packId) return NextResponse.json({ error: "Faltan datos." }, { status: 400 });

    const verification = await verifyOrganizer(eventId);
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const admin = createAdminClient();
    const { error } = await admin
      .from("ticket_packs")
      .update({ active: Boolean(body.active), updated_at: new Date().toISOString() })
      .eq("id", packId)
      .eq("event_id", eventId);

    if (error) return NextResponse.json({ error: "No se pudo actualizar el pack." }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
