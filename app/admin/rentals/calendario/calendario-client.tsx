"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Asset = { id: string; name: string; category: string; active: boolean; notes: string | null };
type Booking = { id: string; asset_id: string; quote_id: string | null; client_name: string; starts_on: string; ends_on: string; notes: string | null };

const INPUT =
  "mt-2 h-11 w-full border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50";
const LABEL = "block text-[9px] font-black uppercase tracking-[0.18em] text-white/40";
const WEEKDAYS = ["D", "L", "M", "M", "J", "V", "S"];
const CHIP_COLORS = [
  "border-[#ff5a2a]/40 bg-[#ff3b24]/15 text-[#ffc0ad]",
  "border-sky-400/40 bg-sky-400/15 text-sky-200",
  "border-violet-400/40 bg-violet-400/15 text-violet-200",
  "border-emerald-400/40 bg-emerald-400/15 text-emerald-200",
  "border-amber-400/40 bg-amber-400/15 text-amber-200",
  "border-rose-400/40 bg-rose-400/15 text-rose-200",
];

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function emptyBookingDraft() {
  return { assetId: "", clientName: "", startsOn: "", endsOn: "", quoteId: "", notes: "" };
}

export default function CalendarioClient() {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });
  const [assets, setAssets] = useState<Asset[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missingSql, setMissingSql] = useState(false);

  const [assetName, setAssetName] = useState("");
  const [savingAsset, setSavingAsset] = useState(false);

  const [bookingDraft, setBookingDraft] = useState(emptyBookingDraft());
  const [savingBooking, setSavingBooking] = useState(false);
  // Si no es null, el formulario de abajo edita esta reserva (PATCH, en vez
  // de crear una nueva) -- mover una reserva de fecha ya no pasa por
  // cancelarla y volver a crearla a mano (si el segundo paso fallaba, la
  // original se perdia sin dejar rastro).
  const [editingId, setEditingId] = useState<string | null>(null);

  const assetColor = useMemo(() => {
    const map = new Map<string, string>();
    assets.forEach((asset, i) => map.set(asset.id, CHIP_COLORS[i % CHIP_COLORS.length]));
    return map;
  }, [assets]);

  const grid = useMemo(() => {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const startWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
    const gridStart = new Date(Date.UTC(year, month, 1 - startWeekday));
    return Array.from({ length: totalCells }, (_, i) => {
      const date = new Date(Date.UTC(year, month, gridStart.getUTCDate() + i));
      return { date, inMonth: date.getUTCMonth() === month };
    });
  }, [cursor]);

  const gridStartIso = iso(grid[0].date);
  const gridEndIso = iso(grid[grid.length - 1].date);

  async function loadAssets() {
    try {
      const response = await fetch("/api/admin/rentals/assets");
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 503) setMissingSql(true);
        throw new Error(result.error ?? "No se pudieron cargar los equipos.");
      }
      setAssets(result.assets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los equipos.");
    }
  }

  async function loadBookings() {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/rentals/bookings?from=${gridStartIso}&to=${gridEndIso}`);
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 503) setMissingSql(true);
        throw new Error(result.error ?? "No se pudieron cargar las reservas.");
      }
      setBookings(result.bookings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las reservas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAssets();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridStartIso, gridEndIso]);

  function bookingsForDay(dateIso: string) {
    return bookings.filter((b) => b.starts_on <= dateIso && b.ends_on >= dateIso);
  }

  async function addAsset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (savingAsset || !assetName.trim()) return;
    setSavingAsset(true);
    setError("");
    try {
      const response = await fetch("/api/admin/rentals/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: assetName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo crear el equipo.");
      setAssets((prev) => [...prev, result.asset].sort((a, b) => a.name.localeCompare(b.name)));
      setAssetName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el equipo.");
    } finally {
      setSavingAsset(false);
    }
  }

  async function toggleAsset(asset: Asset) {
    setError("");
    try {
      const response = await fetch("/api/admin/rentals/assets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: asset.id, active: !asset.active }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar.");
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? result.asset : a)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    }
  }

  async function addBooking(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (savingBooking) return;
    setSavingBooking(true);
    setError("");
    try {
      const response = await fetch("/api/admin/rentals/bookings", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { ...bookingDraft, id: editingId } : bookingDraft),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? (editingId ? "No se pudo actualizar la reserva." : "No se pudo crear la reserva."));
      setBookingDraft(emptyBookingDraft());
      setEditingId(null);
      await loadBookings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la reserva.");
    } finally {
      setSavingBooking(false);
    }
  }

  function editBooking(booking: Booking) {
    setError("");
    setEditingId(booking.id);
    setBookingDraft({
      assetId: booking.asset_id,
      clientName: booking.client_name,
      startsOn: booking.starts_on,
      endsOn: booking.ends_on,
      quoteId: booking.quote_id ?? "",
      notes: booking.notes ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setBookingDraft(emptyBookingDraft());
  }

  async function removeBooking(booking: Booking) {
    if (!window.confirm(`¿Cancelar la reserva de ${booking.client_name}?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/admin/rentals/bookings?id=${booking.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo cancelar.");
      setBookings((prev) => prev.filter((b) => b.id !== booking.id));
      if (editingId === booking.id) cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cancelar.");
    }
  }

  const monthLabel = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(cursor);
  const todayIso = iso(new Date());

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[1100px] px-5 py-8 md:px-8">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href="/admin/rentals" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Rentals
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass admin</p>
          <h1 className="mt-3 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Calendario de rental.</h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">Qué equipo está reservado, para quién y hasta cuándo.</p>
        </header>

        {missingSql && (
          <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Falta aplicar la actualización de la base de datos del calendario de rental (20260980).
          </div>
        )}
        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {/* EQUIPOS */}
        <section className="mt-8 border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Equipos</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => toggleAsset(asset)}
                title={asset.active ? "Click para desactivar" : "Click para reactivar"}
                className={`border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition ${asset.active ? assetColor.get(asset.id) : "border-white/10 bg-white/[0.02] text-white/25"}`}
              >
                {asset.name}
              </button>
            ))}
          </div>
          <form onSubmit={addAsset} className="mt-3 flex gap-2">
            <input value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="Nombre del equipo (ej: Terminal Nº1)" className="h-10 flex-1 border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#ff5a2a]/50" />
            <button type="submit" disabled={savingAsset} className="h-10 border border-white/[0.16] px-4 text-[10px] font-black uppercase tracking-wide text-white/70 hover:border-white/40 hover:text-white disabled:opacity-40">
              + Agregar
            </button>
          </form>
        </section>

        {/* CALENDARIO */}
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() - 1, 1)))} className="h-9 border border-white/[0.14] px-3 text-[10px] font-black uppercase tracking-wide text-white/60 hover:text-white">
              ← Anterior
            </button>
            <p className="text-sm font-black uppercase tracking-wide capitalize">{monthLabel}</p>
            <button type="button" onClick={() => setCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1)))} className="h-9 border border-white/[0.14] px-3 text-[10px] font-black uppercase tracking-wide text-white/60 hover:text-white">
              Siguiente →
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-[1px] bg-white/[0.08] text-center text-[9px] font-black uppercase tracking-wide text-white/30">
            {WEEKDAYS.map((d, i) => (
              <div key={i} className="bg-[#050505] py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-[1px] bg-white/[0.08]">
            {grid.map(({ date, inMonth }) => {
              const dateIso = iso(date);
              const dayBookings = bookingsForDay(dateIso);
              return (
                <div key={dateIso} className={`min-h-[90px] bg-[#080706]/85 p-1.5 ${inMonth ? "" : "opacity-30"} ${dateIso === todayIso ? "ring-1 ring-inset ring-[#ff5a2a]/50" : ""}`}>
                  <p className="text-[10px] font-bold text-white/40">{date.getUTCDate()}</p>
                  <div className="mt-1 space-y-0.5">
                    {dayBookings.slice(0, 3).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => editBooking(b)}
                        title="Click para editar la reserva"
                        className={`block w-full truncate border px-1 py-0.5 text-left text-[9px] font-bold ${editingId === b.id ? "ring-1 ring-white/60" : ""} ${assetColor.get(b.asset_id) ?? "border-white/15 text-white/50"}`}
                      >
                        {b.client_name}
                      </button>
                    ))}
                    {dayBookings.length > 3 && <p className="text-[9px] text-white/30">+{dayBookings.length - 3} más</p>}
                  </div>
                </div>
              );
            })}
          </div>
          {loading && <p className="mt-2 text-[11px] text-white/25">Cargando reservas…</p>}
        </section>

        {/* NUEVA RESERVA / EDITAR */}
        <section className="mt-8 border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">
            {editingId ? "Editar reserva" : "Nueva reserva"}
            {editingId && <span className="ml-2 normal-case tracking-normal text-white/30">(click en otra reserva del calendario para editarla, o cancelá para cargar una nueva)</span>}
          </p>
          <form onSubmit={addBooking}>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <label className="mt-3 block">
                <span className={LABEL}>Equipo *</span>
                <select value={bookingDraft.assetId} onChange={(e) => setBookingDraft((d) => ({ ...d, assetId: e.target.value }))} className={INPUT}>
                  <option value="" className="bg-[#0a0908]">Elegí un equipo…</option>
                  {assets.filter((a) => a.active).map((a) => (
                    <option key={a.id} value={a.id} className="bg-[#0a0908]">{a.name}</option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block">
                <span className={LABEL}>Cliente *</span>
                <input value={bookingDraft.clientName} onChange={(e) => setBookingDraft((d) => ({ ...d, clientName: e.target.value }))} className={INPUT} placeholder="Bar Los Álamos" />
              </label>
            </div>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <label className="mt-3 block">
                <span className={LABEL}>Desde *</span>
                <input type="date" value={bookingDraft.startsOn} onChange={(e) => setBookingDraft((d) => ({ ...d, startsOn: e.target.value }))} className={INPUT} />
              </label>
              <label className="mt-3 block">
                <span className={LABEL}>Hasta *</span>
                <input type="date" value={bookingDraft.endsOn} onChange={(e) => setBookingDraft((d) => ({ ...d, endsOn: e.target.value }))} className={INPUT} />
              </label>
            </div>
            <label className="mt-3 block">
              <span className={LABEL}>Notas</span>
              <input value={bookingDraft.notes} onChange={(e) => setBookingDraft((d) => ({ ...d, notes: e.target.value }))} className={INPUT} />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="submit" disabled={savingBooking} className="h-12 flex-1 bg-[#ff2a1a] px-8 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d] disabled:opacity-40 sm:flex-none">
                {savingBooking ? "Guardando…" : editingId ? "Guardar cambios" : "+ Reservar"}
              </button>
              {editingId && (
                <>
                  <button type="button" onClick={cancelEdit} className="h-12 border border-white/15 px-6 text-[10px] font-black uppercase tracking-wide text-white/60 hover:text-white">
                    Cancelar edición
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const booking = bookings.find((b) => b.id === editingId);
                      if (booking) removeBooking(booking);
                    }}
                    className="h-12 border border-red-400/25 px-6 text-[10px] font-black uppercase tracking-wide text-red-300/80 hover:text-red-300"
                  >
                    Cancelar reserva
                  </button>
                </>
              )}
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}
