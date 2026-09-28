import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyControllerForEvent } from "../../../../lib/control/auth";
import { fetchAllRows } from "../../../../lib/supabase/fetch-all";

// Complemento de /api/control/preload para el modo sin conexion: los socios
// premium de la organizacion del evento (para reconocer un carnet) y la lista
// negra activa (para advertir aunque no haya señal). Es solo lectura y el
// servidor sigue siendo la autoridad cuando hay conexion. Tolerante: si las
// tablas todavia no existen devuelve listas vacias, no un error.
export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId")?.trim();
  if (!eventId) return NextResponse.json({ error: "Falta el evento." }, { status: 400 });

  const verification = await verifyControllerForEvent(eventId);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("organization_id").eq("id", eventId).maybeSingle();
  if (!event) return NextResponse.json({ error: "El evento no existe." }, { status: 404 });

  const members = await fetchAllRows<{ id: string; first_name: string; last_name: string; member_code: string; status: string; expires_at: string | null }>((from, to) =>
    admin
      .from("premium_members")
      .select("id, first_name, last_name, member_code, status, expires_at")
      .eq("organization_id", event.organization_id)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, to)
  );

  const blacklist = await fetchAllRows<{ dni: string | null; reason: string | null }>((from, to) =>
    admin
      .from("blacklist_entries")
      .select("dni, reason")
      .eq("organization_id", event.organization_id)
      .eq("active", true)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, to)
  );

  if (members.error) console.error("PRELOAD SOCIOS:", members.error.message);
  if (blacklist.error) console.error("PRELOAD LISTA NEGRA:", blacklist.error.message);

  return NextResponse.json({
    ok: true,
    eventId,
    members: members.data.map((m) => ({
      id: m.id,
      name: `${m.first_name} ${m.last_name}`.trim(),
      code: m.member_code,
      status: m.status,
      expiresAt: m.expires_at,
    })),
    // El DNI se normaliza a solo digitos, igual que check_blacklist.
    blacklist: blacklist.data
      .map((b) => ({ dni: String(b.dni ?? "").replace(/\D/g, ""), reason: b.reason }))
      .filter((b) => b.dni !== ""),
    syncedAt: new Date().toISOString(),
  });
}
