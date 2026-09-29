"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Item = { table: string; type: string; id: string; label: string; deletedAt: string };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));
}

export default function PapeleraClient() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [truncatedByType, setTruncatedByType] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const response = await fetch("/api/admin/papelera");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo cargar.");
      setItems(result.items);
      setTruncatedByType(result.truncatedByType ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function restore(item: Item) {
    if (busyId) return;
    setBusyId(item.id);
    setError("");
    try {
      const response = await fetch("/api/admin/papelera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: item.table, id: item.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo restaurar.");
      setItems((prev) => (prev ?? []).filter((i) => !(i.table === item.table && i.id === item.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restaurar.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[800px] px-5 py-8 md:px-8">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href="/admin" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Admin
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass admin</p>
          <h1 className="mt-3 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Papelera.</h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">Lo que borraste en los últimos 90 días. Nada se pierde: restauralo con un click.</p>
        </header>

        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {Object.keys(truncatedByType).length > 0 && (
          <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Se muestran solo los 50 borrados más recientes de cada tipo. Hay más sin mostrar en:{" "}
            {Object.entries(truncatedByType)
              .map(([type, count]) => `${type} (${count} más)`)
              .join(", ")}
            . Restaurá los que ves para que aparezcan los siguientes, o pedime que te arme un listado completo.
          </div>
        )}

        <div className="mt-6 space-y-2">
          {items === null && !error && <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Cargando…</div>}
          {items !== null && items.length === 0 && <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">La papelera está vacía.</div>}
          {items?.map((item) => (
            <div key={`${item.table}-${item.id}`} className="flex items-center gap-3 border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <span className="shrink-0 border border-white/15 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white/50">{item.type}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{item.label}</p>
                <p className="text-[11px] text-white/35">Borrado el {formatDate(item.deletedAt)}</p>
              </div>
              <button type="button" disabled={busyId === item.id} onClick={() => restore(item)} className="h-9 shrink-0 border border-emerald-400/30 bg-emerald-400/10 px-3 text-[10px] font-black uppercase tracking-wide text-emerald-300 hover:bg-emerald-400/20 disabled:opacity-40">
                {busyId === item.id ? "…" : "Restaurar"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
