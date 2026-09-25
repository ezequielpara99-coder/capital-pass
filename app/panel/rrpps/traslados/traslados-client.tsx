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
        setRows((prev) => prev.map((r) => (r.id === editingId ? result.route : r)));
      } else {
        setRows((prev) => [...prev, result.route]);
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
      setRows((prev) => prev.map((r) => (r.id === route.id ? result.route : r)));
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
                  <div className="flex gap-2">
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
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
