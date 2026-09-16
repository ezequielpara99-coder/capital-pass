import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyOrganizerForEvent } from "../../../../lib/stock/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventId = String(body.eventId ?? "").trim();
    const name = String(body.name ?? "").trim();

    if (!eventId || !name) {
      return NextResponse.json({ error: "Ponele un nombre a la barra." }, { status: 400 });
    }

    const verification = await verifyOrganizerForEvent(eventId);
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const admin = createAdminClient();
    const { data: bar, error } = await admin
      .from("bars")
      .insert({ event_id: eventId, name })
      .select("id, name, created_at")
      .single();

    if (error || !bar) {
      return NextResponse.json({ error: "No se pudo crear la barra." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, bar }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
