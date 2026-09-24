import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyControllerForEvent } from "../../../../lib/control/auth";

// Devuelve todas las entradas de un evento para que el control de
// ingreso las precargue en el celular (modo offline): mismos datos que
// ya muestra validate_ticket_manual al validar, pero para TODAS las
// entradas de una sola vez en vez de una por una. No hay relacion FK
// declarada entre tickets/sales en el schema de Postgres (esquema base
// no versionado), asi que no se puede usar el embed anidado de
// PostgREST -- se resuelve con consultas separadas, mismo patron que
// ya usan app/api/rrpps/mapa|cobertura/route.ts.
export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId")?.trim();
  if (!eventId) {
    return NextResponse.json({ error: "Falta el evento." }, { status: 400 });
  }

  const verification = await verifyControllerForEvent(eventId);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  const admin = createAdminClient();

  const { data: tickets, error } = await admin
    .from("tickets")
    .select("id, manual_code, status, sale_id, ticket_type_id")
    .eq("event_id", eventId)
    .not("manual_code", "is", null);

  if (error) {
    console.error("ERROR PRELOAD CONTROL:", error);
    return NextResponse.json({ error: "No se pudieron cargar las entradas del evento." }, { status: 500 });
  }

  const rows = tickets ?? [];
  const saleIds = [...new Set(rows.map((t) => t.sale_id).filter((id): id is string => Boolean(id)))];
  const ticketTypeIds = [...new Set(rows.map((t) => t.ticket_type_id).filter((id): id is string => Boolean(id)))];

  const [{ data: sales }, { data: ticketTypes }] = await Promise.all([
    saleIds.length
      ? admin.from("sales").select("id, buyer_id").in("id", saleIds)
      : Promise.resolve({ data: [] as { id: string; buyer_id: string | null }[] }),
    ticketTypeIds.length
      ? admin.from("ticket_types").select("id, name").in("id", ticketTypeIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const saleById = new Map((sales ?? []).map((s) => [s.id, s]));
  const ticketTypeNameById = new Map((ticketTypes ?? []).map((tt) => [tt.id, tt.name]));

  const buyerIds = [...new Set((sales ?? []).map((s) => s.buyer_id).filter((id): id is string => Boolean(id)))];
  const { data: buyers } = buyerIds.length
    ? await admin.from("buyers").select("id, first_name, last_name, dni").in("id", buyerIds)
    : { data: [] as { id: string; first_name: string; last_name: string; dni: string | null }[] };
  const buyerById = new Map((buyers ?? []).map((b) => [b.id, b]));

  const items = rows.map((ticket) => {
    const sale = ticket.sale_id ? saleById.get(ticket.sale_id) : null;
    const buyer = sale?.buyer_id ? buyerById.get(sale.buyer_id) : null;

    return {
      ticketId: ticket.id,
      manualCode: (ticket.manual_code as string).toUpperCase(),
      status: ticket.status as string,
      buyerName: buyer ? `${buyer.first_name} ${buyer.last_name}`.trim() : "",
      buyerDni: buyer?.dni ?? null,
      ticketType: ticket.ticket_type_id ? ticketTypeNameById.get(ticket.ticket_type_id) ?? "" : "",
    };
  });

  return NextResponse.json({ ok: true, eventId, tickets: items, syncedAt: new Date().toISOString() });
}
