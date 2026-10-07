import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyControllerForEvent } from "../../../../lib/control/auth";
import { fetchAllRows } from "../../../../lib/supabase/fetch-all";
import { createTicketSignature } from "../../../../lib/tickets/signature";

// Un .in() con cientos de UUID se pasa del largo maximo de la URL: se consulta
// de a tandas.
const CHUNK = 100;
function chunks<T>(values: T[], size = CHUNK) {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

// Devuelve todas las entradas de un evento para que el control de
// ingreso las precargue en el celular (modo offline): mismos datos que
// ya muestra validate_ticket_manual al validar, pero para TODAS las
// entradas de una sola vez en vez de una por una. No hay relacion FK
// declarada entre tickets/sales en el schema de Postgres (esquema base
// no versionado), asi que no se puede usar el embed anidado de
// PostgREST -- se resuelve con consultas separadas, mismo patron que
// ya usan app/api/rrpps/mapa|cobertura/route.ts.
//
// Las entradas se leen paginadas: PostgREST corta en 1000 filas, y un evento
// con mas entradas que eso quedaba con el cache offline INCOMPLETO (las que
// faltaban se rechazaban como "no encontradas" sin señal).
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

  const { data: rows, error } = await fetchAllRows<{ id: string; manual_code: string | null; status: string; sale_id: string | null; ticket_type_id: string | null }>(
    (from, to) =>
      admin
        .from("tickets")
        .select("id, manual_code, status, sale_id, ticket_type_id")
        .eq("event_id", eventId)
        .not("manual_code", "is", null)
        .order("id", { ascending: true })
        .range(from, to)
  );

  if (error) {
    console.error("ERROR PRELOAD CONTROL:", error);
    return NextResponse.json({ error: "No se pudieron cargar las entradas del evento." }, { status: 500 });
  }

  const saleIds = [...new Set(rows.map((t) => t.sale_id).filter((id): id is string => Boolean(id)))];
  const ticketTypeIds = [...new Set(rows.map((t) => t.ticket_type_id).filter((id): id is string => Boolean(id)))];

  const sales: { id: string; buyer_id: string | null; status: string; table_id: string | null }[] = [];
  for (const group of chunks(saleIds)) {
    const { data } = await admin.from("sales").select("id, buyer_id, status, table_id").in("id", group);
    sales.push(...((data ?? []) as typeof sales));
  }

  // Entradas de mesa: no tienen tanda, se muestran con el nombre de la mesa
  // (igual que validate_ticket_manual en el modo con conexion).
  const tableIds = [...new Set(sales.map((s) => s.table_id).filter((id): id is string => Boolean(id)))];
  const { data: tables } = tableIds.length
    ? await admin.from("bar_tables").select("id, name").in("id", tableIds)
    : { data: [] as { id: string; name: string }[] };
  const tableNameById = new Map((tables ?? []).map((t) => [t.id, t.name]));

  const { data: ticketTypes } = ticketTypeIds.length
    ? await admin.from("ticket_types").select("id, name").in("id", ticketTypeIds)
    : { data: [] as { id: string; name: string }[] };

  const saleById = new Map(sales.map((s) => [s.id, s]));
  const ticketTypeNameById = new Map((ticketTypes ?? []).map((tt) => [tt.id, tt.name]));

  const buyerIds = [...new Set(sales.map((s) => s.buyer_id).filter((id): id is string => Boolean(id)))];
  const buyers: { id: string; first_name: string; last_name: string; dni: string | null }[] = [];
  for (const group of chunks(buyerIds)) {
    const { data } = await admin.from("buyers").select("id, first_name, last_name, dni").in("id", group);
    buyers.push(...((data ?? []) as typeof buyers));
  }
  const buyerById = new Map(buyers.map((b) => [b.id, b]));

  const items = rows.map((ticket) => {
    const sale = ticket.sale_id ? saleById.get(ticket.sale_id) : null;
    const buyer = sale?.buyer_id ? buyerById.get(sale.buyer_id) : null;

    // Sin conexion la puerta decide solo con este cache: una entrada de una
    // venta cancelada o reembolsada tiene que figurar anulada, igual que la
    // rechaza validate_ticket_manual con conexion.
    const saleVoided = Boolean(sale) && sale?.status !== "confirmed";
    const tableName = sale?.table_id ? tableNameById.get(sale.table_id) : null;

    return {
      ticketId: ticket.id,
      manualCode: (ticket.manual_code as string).toUpperCase(),
      status: saleVoided && ticket.status === "issued" ? "cancelled" : (ticket.status as string),
      buyerName: buyer ? `${buyer.first_name} ${buyer.last_name}`.trim() : "",
      buyerDni: buyer?.dni ?? null,
      ticketType: ticket.ticket_type_id
        ? ticketTypeNameById.get(ticket.ticket_type_id) ?? ""
        : tableName ? `${tableName} (mesa)` : "Mesa",
      // Firma real, calculada aca (unico lugar con el secret) para que el
      // modo offline pueda comparar contra ella sin confiar solo en que el
      // ticketId (publico) este en el cache.
      signature: createTicketSignature(ticket.id),
    };
  });

  return NextResponse.json({ ok: true, eventId, tickets: items, syncedAt: new Date().toISOString() });
}
