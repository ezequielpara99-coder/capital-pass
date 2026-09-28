import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TrackingStop = { id: string; position: number; name: string; arrivedAt: string | null };

export type TrackedRoute = {
  ticketId: string;
  manualCode: string;
  ticketStatus: "issued" | "used";
  passengerName: string;
  routeId: string;
  routeName: string;
  eventName: string;
  eventStartsAt: string | null;
  departureAt: string | null;
  departureLocation: string | null;
  stops: TrackingStop[];
  currentStopId: string | null;
  currentStopAt: string | null;
  myStopId: string | null;
  // not_started | approaching | at_my_stop | passed | no_stop (el pasajero no tiene parada asignada)
  state: "not_started" | "approaching" | "at_my_stop" | "passed" | "no_stop";
  stopsAway: number | null;
  etaMinutes: number | null;
};

type Identity = { organizationId?: string | null; email?: string | null; dni?: string | null; phone?: string | null };

// Saca caracteres que rompen los filtros .or() de PostgREST.
function clean(value: string) {
  return value.replace(/[,()*%\\]/g, " ").trim();
}

const digitsOf = (value: string) => value.replace(/\D/g, "");

// Encuentra los pasajes de colectivo de una persona (por email, DNI o
// telefono con el que compro la entrada o con el que la cargo el RRPP) y
// arma por donde va cada colectivo. Solo eventos proximos o en curso.
export async function trackingForIdentity(admin: SupabaseClient, identity: Identity): Promise<TrackedRoute[]> {
  const email = identity.email ? clean(identity.email).toLowerCase() : "";
  const dniRaw = identity.dni ? clean(identity.dni) : "";
  const dniDigits = dniRaw ? digitsOf(dniRaw) : "";
  const phoneRaw = identity.phone ? clean(identity.phone) : "";
  const phoneDigits = phoneRaw ? digitsOf(phoneRaw) : "";

  const ticketRows = new Map<string, { id: string; route_id: string; stop_id: string | null; manual_code: string; status: string; passenger_name: string }>();
  const select = "id, route_id, stop_id, manual_code, status, passenger_name";

  // 1) Por compra: el comprador de la venta a la que se le sumo el colectivo.
  const filters: string[] = [];
  if (email) filters.push(`email.ilike.${email}`);
  if (dniRaw) filters.push(`dni.in.(${[...new Set([dniRaw, dniDigits].filter(Boolean))].join(",")})`);
  if (filters.length > 0) {
    let buyerQuery = admin.from("buyers").select("id").or(filters.join(",")).limit(100);
    if (identity.organizationId) buyerQuery = buyerQuery.eq("organization_id", identity.organizationId);
    const { data: buyers } = await buyerQuery;
    const buyerIds = (buyers ?? []).map((b) => b.id as string);
    if (buyerIds.length > 0) {
      const { data: sales } = await admin.from("sales").select("id").in("buyer_id", buyerIds).eq("status", "confirmed").limit(300);
      const saleIds = (sales ?? []).map((s) => s.id as string);
      if (saleIds.length > 0) {
        const { data } = await admin.from("transfer_tickets").select(select).in("sale_id", saleIds).in("status", ["issued", "used"]).limit(100);
        for (const row of data ?? []) ticketRows.set(row.id as string, row as never);
      }
    }
  }

  // 2) Por telefono cargado en el pasaje.
  const phones = [...new Set([phoneRaw, phoneDigits].filter(Boolean))];
  if (phones.length > 0) {
    const { data } = await admin.from("transfer_tickets").select(select).in("passenger_phone", phones).in("status", ["issued", "used"]).limit(100);
    for (const row of data ?? []) ticketRows.set(row.id as string, row as never);
  }

  const tickets = [...ticketRows.values()];
  if (tickets.length === 0) return [];

  const routeIds = [...new Set(tickets.map((t) => t.route_id))];
  const { data: routes } = await admin
    .from("transfer_routes")
    .select("id, event_id, name, departure_at, departure_location, current_stop_id, current_stop_at")
    .in("id", routeIds)
    .eq("active", true)
    .is("deleted_at", null);
  if (!routes || routes.length === 0) return [];

  const eventIds = [...new Set(routes.map((r) => r.event_id as string))];
  const { data: events } = await admin.from("events").select("id, name, starts_at, status").in("id", eventIds).in("status", ["upcoming", "active"]);
  const eventMap = new Map((events ?? []).map((e) => [e.id as string, e]));

  const liveRouteIds = routes.filter((r) => eventMap.has(r.event_id as string)).map((r) => r.id as string);
  if (liveRouteIds.length === 0) return [];

  const [{ data: stopRows }, { data: arrivalRows }] = await Promise.all([
    admin.from("transfer_route_stops").select("id, route_id, position, name").in("route_id", liveRouteIds).order("position", { ascending: true }),
    admin.from("transfer_route_arrivals").select("route_id, stop_id, arrived_at").in("route_id", liveRouteIds),
  ]);

  const result: TrackedRoute[] = [];
  const now = Date.now();

  for (const ticket of tickets) {
    const route = routes.find((r) => r.id === ticket.route_id);
    const event = route ? eventMap.get(route.event_id as string) : null;
    if (!route || !event) continue;

    const arrivals = new Map((arrivalRows ?? []).filter((a) => a.route_id === route.id).map((a) => [a.stop_id as string, a.arrived_at as string]));
    const stops: TrackingStop[] = (stopRows ?? [])
      .filter((s) => s.route_id === route.id)
      .map((s) => ({ id: s.id as string, position: Number(s.position), name: s.name as string, arrivedAt: arrivals.get(s.id as string) ?? null }));

    const current = stops.find((s) => s.id === route.current_stop_id) ?? null;
    const mine = stops.find((s) => s.id === ticket.stop_id) ?? null;

    let state: TrackedRoute["state"];
    let stopsAway: number | null = null;
    let etaMinutes: number | null = null;

    if (!mine) state = current ? "no_stop" : "not_started";
    else if (!current) state = "not_started";
    else if (mine.position === current.position) state = "at_my_stop";
    else if (mine.position < current.position) state = "passed";
    else {
      state = "approaching";
      stopsAway = mine.position - current.position;

      // Estimacion: promedio de tiempo entre las paradas ya recorridas.
      const reached = stops.filter((s) => s.arrivedAt).sort((a, b) => a.position - b.position);
      if (reached.length >= 2 && current) {
        const first = reached[0];
        const last = reached[reached.length - 1];
        const steps = last.position - first.position;
        const elapsed = new Date(last.arrivedAt as string).getTime() - new Date(first.arrivedAt as string).getTime();
        if (steps > 0 && elapsed > 0) {
          const perStep = elapsed / steps;
          const arrivalAt = new Date(route.current_stop_at as string).getTime() + perStep * stopsAway;
          etaMinutes = Math.max(0, Math.round((arrivalAt - now) / 60000));
        }
      }
    }

    result.push({
      ticketId: ticket.id,
      manualCode: ticket.manual_code,
      ticketStatus: ticket.status as "issued" | "used",
      passengerName: ticket.passenger_name,
      routeId: route.id as string,
      routeName: route.name as string,
      eventName: event.name as string,
      eventStartsAt: (event.starts_at as string | null) ?? null,
      departureAt: (route.departure_at as string | null) ?? null,
      departureLocation: (route.departure_location as string | null) ?? null,
      stops,
      currentStopId: (route.current_stop_id as string | null) ?? null,
      currentStopAt: (route.current_stop_at as string | null) ?? null,
      myStopId: mine?.id ?? null,
      state,
      stopsAway,
      etaMinutes,
    });
  }

  return result.sort((a, b) => (a.eventStartsAt ?? "").localeCompare(b.eventStartsAt ?? ""));
}
