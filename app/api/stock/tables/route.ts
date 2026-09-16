import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyOrganizerForEvent } from "../../../../lib/stock/auth";

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

    return NextResponse.json({ ok: true, table }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
