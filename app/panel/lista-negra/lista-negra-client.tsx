"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Entry = {
  id: string;
  dni: string;
  full_name: string | null;
  reason: string | null;
  active: boolean;
  created_at: string;
};

const INPUT =
  "mt-2 h-12 w-full border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50";
const LABEL = "block text-[9px] font-black uppercase tracking-[0.18em] text-white/40";

function emptyDraft() {
  return { dni: "", fullName: "", reason: "" };
}

export default function ListaNegraClient() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [missingSql, setMissingSql] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/panel/lista-negra");
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 503) setMissingSql(true);
        throw new Error(result.error ?? "No se pudo cargar.");
      }
      setEntries(result.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/panel/lista-negra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo agregar.");
      setEntries((prev) => [result.entry, ...(prev ?? [])]);
      setDraft(emptyDraft());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(entry: Entry) {
    setError("");
    try {
      const response = await fetch("/api/panel/lista-negra", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, active: !entry.active }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar.");
      setEntries((prev) => (prev ?? []).map((e) => (e.id === entry.id ? result.entry : e)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    }
  }

  async function remove(entry: Entry) {
    if (!window.confirm(`¿Sacar a "${entry.full_name || entry.dni}" de la lista?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/panel/lista-negra?id=${entry.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo borrar.");
      setEntries((prev) => (prev ?? []).filter((e) => e.id !== entry.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    }
  }

  const visible = (entries ?? []).filter((e) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return `${e.full_name ?? ""} ${e.dni}`.toLowerCase().includes(term);
  });

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href="/panel" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Panel
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass</p>
          <h1 className="mt-3 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Lista negra.</h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">
            Gente restringida en todos tus eventos. En la puerta (app/control), si la entrada que se valida es de alguien acá, el controlador ve una advertencia — la decisión de dejarlo entrar sigue siendo suya.
          </p>
        </header>

        {missingSql && (
          <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Falta aplicar la actualización de la base de datos de lista negra (20260974).
          </div>
        )}
        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <form onSubmit={submit} className="mt-8 border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Agregar a la lista</p>

          <div className="grid gap-x-4 sm:grid-cols-2">
            <label className="mt-3 block">
              <span className={LABEL}>DNI *</span>
              <input value={draft.dni} onChange={(e) => setDraft((d) => ({ ...d, dni: e.target.value }))} inputMode="numeric" className={INPUT} placeholder="40123456" />
            </label>
            <label className="mt-3 block">
              <span className={LABEL}>Nombre (opcional)</span>
              <input value={draft.fullName} onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))} className={INPUT} />
            </label>
          </div>

          <label className="mt-3 block">
            <span className={LABEL}>Motivo</span>
            <input value={draft.reason} onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))} className={INPUT} placeholder="Pelea en la puerta, 15/03/2026" />
          </label>

          <button type="submit" disabled={saving} className="mt-4 h-12 w-full bg-red-600 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-red-500 disabled:opacity-40 sm:w-auto sm:px-8">
            {saving ? "Guardando…" : "+ Agregar a la lista"}
          </button>
        </form>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o DNI…"
          className="mt-6 h-11 w-full border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#ff5a2a]/50"
        />

        <div className="mt-6 space-y-2">
          {entries === null ? (
            <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Cargando…</div>
          ) : visible.length === 0 ? (
            <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">
              {entries.length === 0 ? "Todavía no hay nadie en la lista." : "Nadie coincide con la búsqueda."}
            </div>
          ) : (
            visible.map((entry) => (
              <div key={entry.id} className={`flex items-center gap-3 border px-4 py-3 ${entry.active ? "border-red-400/20 bg-red-500/[0.04]" : "border-white/[0.08] bg-white/[0.02] opacity-50"}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {entry.full_name || "Sin nombre"} <span className="text-white/30">· DNI {entry.dni}</span>
                    {!entry.active && <span className="ml-2 text-[10px] font-black uppercase text-white/30">Inactivo</span>}
                  </p>
                  {entry.reason && <p className="mt-0.5 truncate text-[11px] text-white/35">{entry.reason}</p>}
                </div>
                <button type="button" onClick={() => toggleActive(entry)} className="h-9 border border-white/15 px-3 text-[10px] font-black uppercase tracking-wide text-white/60 hover:border-white/40 hover:text-white">
                  {entry.active ? "Desactivar" : "Reactivar"}
                </button>
                <button type="button" onClick={() => remove(entry)} className="h-9 border border-red-400/20 px-3 text-[10px] font-black uppercase tracking-wide text-red-300/70 hover:text-red-300">
                  Quitar
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
