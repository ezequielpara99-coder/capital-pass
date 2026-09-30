"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

function withEvent(path: string, eventId: string) {
  return `${path}?eventId=${encodeURIComponent(eventId)}`;
}

export type RrppOption = { id: string; name: string };
export type TransferRoute = {
  id: string;
  event_id: string;
  organization_member_id: string | null;
  name: string;
  departure_at: string | null;
  departure_location: string | null;
  capacity: number | null;
  is_paid: boolean;
  price_minor: number;
  active: boolean;
  created_at: string;
  stops: { id: string; position: number; name: string }[];
};

type Passenger = {
  id: string;
  passenger_name: string;
  passenger_phone: string | null;
  manual_code: string;
  status: "issued" | "used" | "cancelled";
  stop_id: string | null;
};

const INPUT =
  "mt-2 h-12 w-full border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50";
const LABEL = "block text-[9px] font-black uppercase tracking-[0.18em] text-white/40";

function formatMoney(minor: number) {
  return `$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(minor)}`;
}

function emptyDraft() {
  return { organizationMemberId: "", name: "", departureAt: "", departureLocation: "", capacity: "", isPaid: false, priceMinor: "" };
}

export default function TrasladosClient({
  event,
  rrpps,
  routes,
  missingSql,
}: {
  event: { id: string; name: string };
  rrpps: RrppOption[];
  routes: TransferRoute[];
  missingSql: boolean;
}) {
  const [rows, setRows] = useState(routes);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rrppName = (id: string | null) => (id ? rrpps.find((r) => r.id === id)?.name ?? "RRPP" : "General (organizador)");

  function startEdit(route: TransferRoute) {
    setEditingId(route.id);
    setDraft({
      organizationMemberId: route.organization_member_id ?? "",
      name: route.name,
      departureAt: route.departure_at ? route.departure_at.slice(0, 16) : "",
      departureLocation: route.departure_location ?? "",
      capacity: route.capacity ? String(route.capacity) : "",
      isPaid: route.is_paid,
      priceMinor: route.price_minor ? String(route.price_minor) : "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(emptyDraft());
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const body = {
        eventId: event.id,
        organizationMemberId: draft.organizationMemberId,
        name: draft.name,
        departureAt: draft.departureAt ? new Date(draft.departureAt).toISOString() : null,
        departureLocation: draft.departureLocation,
        capacity: draft.capacity,
        isPaid: draft.isPaid,
        priceMinor: draft.priceMinor,
      };
      const response = await fetch("/api/rrpps/traslados", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { ...body, id: editingId } : body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");

      if (editingId) {
        setRows((prev) => prev.map((r) => (r.id === editingId ? { ...result.route, stops: r.stops } : r)));
      } else {
        setRows((prev) => [...prev, { ...result.route, stops: [] }]);
      }
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(route: TransferRoute) {
    setError("");
    try {
      const response = await fetch("/api/rrpps/traslados", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: route.id, eventId: event.id, active: !route.active }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar.");
      setRows((prev) => prev.map((r) => (r.id === route.id ? { ...result.route, stops: r.stops } : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    }
  }

  async function remove(route: TransferRoute) {
    if (!window.confirm(`¿Borrar el colectivo "${route.name}"?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/rrpps/traslados?id=${route.id}&eventId=${event.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo borrar.");
      setRows((prev) => prev.filter((r) => r.id !== route.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    }
  }

  // Paradas (recorrido): una localidad por linea, en el orden en que pasa el colectivo.
  const [stopsOpenId, setStopsOpenId] = useState<string | null>(null);
  const [stopsText, setStopsText] = useState("");
  const [stopsSaving, setStopsSaving] = useState(false);

  function openStops(route: TransferRoute) {
    setStopsOpenId(stopsOpenId === route.id ? null : route.id);
    setStopsText(route.stops.map((s) => s.name).join("\n"));
    setError("");
  }

  async function saveStops(route: TransferRoute) {
    if (stopsSaving) return;
    setStopsSaving(true);
    setError("");
    try {
      const response = await fetch("/api/rrpps/traslados/paradas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, routeId: route.id, stops: stopsText.split("\n") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudieron guardar las paradas.");
      setRows((prev) => prev.map((r) => (r.id === route.id ? { ...r, stops: result.stops } : r)));
      setStopsOpenId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar las paradas.");
    } finally {
      setStopsSaving(false);
    }
  }

  // Pasajeros y cancelacion -- se cargan al abrir, no de entrada (evita un
  // fetch por cada colectivo del evento si el organizador no los mira).
  const [passengersOpenId, setPassengersOpenId] = useState<string | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [passengersLoading, setPassengersLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function openPassengers(route: TransferRoute) {
    if (passengersOpenId === route.id) {
      setPassengersOpenId(null);
      return;
    }
    setPassengersOpenId(route.id);
    setPassengersLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/rrpps/traslados/pasajeros?eventId=${event.id}&routeId=${route.id}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudieron cargar los pasajeros.");
      setPassengers(result.passengers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los pasajeros.");
    } finally {
      setPassengersLoading(false);
    }
  }

  async function cancelPassenger(route: TransferRoute, passenger: Passenger) {
    if (!window.confirm(`¿Cancelar el pasaje de "${passenger.passenger_name}"? Libera su lugar y el código deja de ser válido.`)) return;
    setCancellingId(passenger.id);
    setError("");
    try {
      const response = await fetch("/api/rrpps/traslados/pasajeros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, routeId: route.id, ticketId: passenger.id, reason: "Cancelado por el organizador" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo cancelar.");
      setPassengers((prev) => prev.map((p) => (p.id === passenger.id ? { ...p, status: "cancelled" } : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cancelar.");
    } finally {
      setCancellingId(null);
    }
  }

  const editing = editingId !== null;

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href={withEvent("/panel/rrpps", event.id)} className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← RRPPs
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">{event.name}</p>
          <h1 className="mt-3 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Traslados.</h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">
            Colectivos por RRPP. Cada RRPP le suma pasajeros al suyo desde su venta y los escanea al embarcar, desde /rrpp.
          </p>
        </header>

        {missingSql && (
          <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Falta aplicar la actualización de la base de datos de traslados (20260971).
          </div>
        )}
        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <form onSubmit={submit} className="mt-8 border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">{editing ? "Editando colectivo" : "Nuevo colectivo"}</p>

          <label className="mt-3 block">
            <span className={LABEL}>Nombre *</span>
            <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className={INPUT} placeholder="Colectivo salida Once" />
          </label>

          <label className="mt-3 block">
            <span className={LABEL}>Dueño</span>
            <select value={draft.organizationMemberId} onChange={(e) => setDraft((d) => ({ ...d, organizationMemberId: e.target.value }))} className={INPUT}>
              <option value="" className="bg-[#0a0908]">General (lo maneja el organizador)</option>
              {rrpps.map((r) => (
                <option key={r.id} value={r.id} className="bg-[#0a0908]">{r.name}</option>
              ))}
            </select>
          </label>

          <div className="grid gap-x-4 sm:grid-cols-2">
            <label className="mt-3 block">
              <span className={LABEL}>Salida (fecha y hora)</span>
              <input type="datetime-local" value={draft.departureAt} onChange={(e) => setDraft((d) => ({ ...d, departureAt: e.target.value }))} className={INPUT} />
            </label>
            <label className="mt-3 block">
              <span className={LABEL}>Lugar de salida</span>
              <input value={draft.departureLocation} onChange={(e) => setDraft((d) => ({ ...d, departureLocation: e.target.value }))} className={INPUT} placeholder="Plaza Once" />
            </label>
          </div>

          <label className="mt-3 block max-w-[200px]">
            <span className={LABEL}>Capacidad (vacío = sin límite)</span>
            <input value={draft.capacity} onChange={(e) => setDraft((d) => ({ ...d, capacity: e.target.value }))} inputMode="numeric" className={INPUT} placeholder="45" />
          </label>

          <label className="mt-4 flex items-center gap-2">
            <input type="checkbox" checked={draft.isPaid} onChange={(e) => setDraft((d) => ({ ...d, isPaid: e.target.checked }))} className="h-4 w-4" />
            <span className="text-xs text-white/60">Es pago (el RRPP lo cobra aparte de la entrada)</span>
          </label>

          {draft.isPaid && (
            <label className="mt-3 block max-w-[200px]">
              <span className={LABEL}>Precio ($)</span>
              <input value={draft.priceMinor} onChange={(e) => setDraft((d) => ({ ...d, priceMinor: e.target.value }))} inputMode="numeric" className={INPUT} placeholder="5000" />
            </label>
          )}

          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={saving} className="h-12 flex-1 bg-[#ff2a1a] text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d] disabled:opacity-40">
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "+ Agregar colectivo"}
            </button>
            {editing && (
              <button type="button" onClick={cancelEdit} className="h-12 border border-white/[0.14] px-5 text-[10px] font-black uppercase tracking-[0.14em] text-white/60 hover:text-white">
                Cancelar
              </button>
            )}
          </div>
        </form>

        <div className="mt-8 space-y-2">
          {rows.length === 0 ? (
            <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Todavía no hay colectivos para este evento.</div>
          ) : (
            rows.map((route) => (
              <div key={route.id} className={`border bg-white/[0.02] px-4 py-3 ${route.active ? "border-white/[0.08]" : "border-white/[0.05] opacity-50"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">
                      {route.name} <span className="text-white/30">· {rrppName(route.organization_member_id)}</span>
                      {!route.active && <span className="ml-2 text-[10px] font-black uppercase text-white/30">Inactivo</span>}
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/35">
                      {route.departure_location || "Sin lugar de salida"}
                      {route.capacity ? ` · Cupo ${route.capacity}` : " · Sin límite de cupo"}
                      {route.is_paid ? ` · ${formatMoney(route.price_minor)}` : " · Gratis"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => openPassengers(route)} className="h-9 border border-sky-400/30 px-3 text-[10px] font-black uppercase tracking-wide text-sky-300 hover:bg-sky-400/10">
                      Pasajeros
                    </button>
                    <button type="button" onClick={() => openStops(route)} className="h-9 border border-violet-400/30 px-3 text-[10px] font-black uppercase tracking-wide text-violet-300 hover:bg-violet-400/10">
                      Recorrido{route.stops.length > 0 ? ` (${route.stops.length})` : ""}
                    </button>
                    <button type="button" onClick={() => startEdit(route)} className="h-9 border border-white/15 px-3 text-[10px] font-black uppercase tracking-wide text-white/60 hover:border-white/40 hover:text-white">
                      Editar
                    </button>
                    <button type="button" onClick={() => toggleActive(route)} className="h-9 border border-white/15 px-3 text-[10px] font-black uppercase tracking-wide text-white/60 hover:border-white/40 hover:text-white">
                      {route.active ? "Desactivar" : "Reactivar"}
                    </button>
                    <button type="button" onClick={() => remove(route)} className="h-9 border border-red-400/20 px-3 text-[10px] font-black uppercase tracking-wide text-red-300/70 hover:text-red-300">
                      Quitar
                    </button>
                  </div>
                </div>

                {passengersOpenId === route.id && (
                  <div className="mt-3 border-t border-white/[0.06] pt-3">
                    <span className={LABEL}>Pasajeros</span>
                    {passengersLoading ? (
                      <p className="mt-2 text-xs text-white/40">Cargando…</p>
                    ) : passengers.length === 0 ? (
                      <p className="mt-2 text-xs text-white/40">Todavía no tiene pasajeros.</p>
                    ) : (
                      <div className="mt-2 divide-y divide-white/[0.06]">
                        {passengers.map((p) => (
                          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <div>
                              <p className="text-xs font-bold text-white/80">
                                {p.passenger_name} <span className="text-white/30">· {p.manual_code}</span>
                              </p>
                              <p className="mt-0.5 text-[11px] text-white/35">
                                {p.passenger_phone || "Sin teléfono"}
                                {" · "}
                                {p.status === "issued" ? "Pendiente" : p.status === "used" ? "Embarcó" : "Cancelado"}
                              </p>
                            </div>
                            {p.status === "issued" && (
                              <button
                                type="button"
                                disabled={cancellingId === p.id}
                                onClick={() => cancelPassenger(route, p)}
                                className="h-8 border border-red-400/20 px-3 text-[10px] font-black uppercase tracking-wide text-red-300/70 hover:text-red-300 disabled:opacity-40"
                              >
                                {cancellingId === p.id ? "Cancelando…" : "Cancelar pasaje"}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {route.stops.length > 0 && stopsOpenId !== route.id && (
                  <p className="mt-2 text-[11px] text-white/40">Recorrido: {route.stops.map((s) => s.name).join(" → ")}</p>
                )}

                {stopsOpenId === route.id && (
                  <div className="mt-3 border-t border-white/[0.06] pt-3">
                    <span className={LABEL}>Paradas, una por línea y en orden (la primera es la salida)</span>
                    <textarea
                      value={stopsText}
                      onChange={(e) => setStopsText(e.target.value)}
                      rows={Math.min(12, Math.max(4, stopsText.split("\n").length + 1))}
                      placeholder={"Rosario\nSan Nicolás\nPergamino\nSalto"}
                      className="mt-2 w-full border border-white/[0.12] bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#ff5a2a]/50"
                    />
                    <p className="mt-1 text-[11px] text-white/35">Cada pasajero elige en qué parada sube al venderle el traslado. Los clientes ven por dónde va el colectivo en su app.</p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" disabled={stopsSaving} onClick={() => saveStops(route)} className="h-10 bg-[#ff2a1a] px-5 text-[10px] font-black uppercase tracking-[0.14em] text-white disabled:opacity-40">
                        {stopsSaving ? "Guardando…" : "Guardar recorrido"}
                      </button>
                      <button type="button" onClick={() => setStopsOpenId(null)} className="h-10 border border-white/[0.14] px-4 text-[10px] font-black uppercase tracking-[0.14em] text-white/60">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
