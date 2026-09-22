"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

export type QuoteClient = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

const INPUT =
  "mt-2 h-12 w-full border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50";
const LABEL = "block text-[9px] font-black uppercase tracking-[0.18em] text-white/40";

function emptyDraft() {
  return { name: "", contact: "", phone: "", email: "", notes: "" };
}

export default function ClientesClient({ clients, missingSql }: { clients: QuoteClient[]; missingSql: boolean }) {
  const [rows, setRows] = useState(clients);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft());

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => `${row.name} ${row.contact ?? ""} ${row.phone ?? ""} ${row.email ?? ""}`.toLowerCase().includes(term));
  }, [rows, search]);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/presupuestos/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");
      setRows((prev) => [...prev, result.client].sort((a, b) => a.name.localeCompare(b.name)));
      setDraft(emptyDraft());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(client: QuoteClient) {
    setEditingId(client.id);
    setDraft({
      name: client.name,
      contact: client.contact ?? "",
      phone: client.phone ?? "",
      email: client.email ?? "",
      notes: client.notes ?? "",
    });
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !editingId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/presupuestos/clientes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...draft }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");
      setRows((prev) => prev.map((row) => (row.id === editingId ? result.client : row)).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingId(null);
      setDraft(emptyDraft());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(client: QuoteClient) {
    if (!window.confirm(`¿Sacar a "${client.name}" del directorio?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/admin/presupuestos/clientes?id=${client.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo borrar.");
      setRows((prev) => prev.filter((row) => row.id !== client.id));
      if (editingId === client.id) {
        setEditingId(null);
        setDraft(emptyDraft());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    }
  }

  const editing = editingId !== null;

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href="/admin/presupuestos" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Presupuestos
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass admin</p>
          <h1 className="mt-3 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Clientes.</h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">Guardá un cliente una vez y reutilizalo en los próximos presupuestos, sin cargar sus datos de nuevo.</p>
        </header>

        {missingSql && (
          <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Falta aplicar la actualización de la base de datos de clientes (20260943).
          </div>
        )}
        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <form onSubmit={editing ? saveEdit : add} className="mt-8 border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">{editing ? "Editando cliente" : "Nuevo cliente"}</p>

          <label className="mt-3 block">
            <span className={LABEL}>Nombre *</span>
            <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className={INPUT} placeholder="Bar Los Álamos" />
          </label>

          <div className="grid gap-x-4 sm:grid-cols-2">
            <label className="mt-3 block">
              <span className={LABEL}>Contacto</span>
              <input value={draft.contact} onChange={(e) => setDraft((d) => ({ ...d, contact: e.target.value }))} className={INPUT} placeholder="María Fernández" />
            </label>
            <label className="mt-3 block">
              <span className={LABEL}>Teléfono</span>
              <input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} inputMode="tel" className={INPUT} />
            </label>
          </div>

          <label className="mt-3 block">
            <span className={LABEL}>Email</span>
            <input value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} inputMode="email" className={INPUT} />
          </label>

          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={busy} className="h-12 flex-1 bg-[#ff2a1a] text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d] disabled:opacity-40">
              {busy ? "Guardando…" : editing ? "Guardar cambios" : "+ Agregar cliente"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setDraft(emptyDraft());
                }}
                className="h-12 border border-white/[0.14] px-5 text-[10px] font-black uppercase tracking-[0.14em] text-white/60 hover:text-white"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente…"
          className="mt-6 h-11 w-full border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#ff5a2a]/50"
        />

        {visible.length === 0 ? (
          <div className="mt-6 border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">
            {rows.length === 0 ? "Todavía no hay clientes guardados." : "Ningún cliente coincide con la búsqueda."}
          </div>
        ) : (
          <div className="mt-6 space-y-2">
            {visible.map((client) => (
              <div key={client.id} className="flex items-center gap-3 border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{client.name}</p>
                  <p className="truncate text-[11px] text-white/35">
                    {[client.contact, client.phone, client.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                  </p>
                </div>
                <button type="button" onClick={() => startEdit(client)} className="h-9 border border-white/15 px-3 text-[10px] font-black uppercase tracking-wide text-white/60 hover:border-white/40 hover:text-white">
                  Editar
                </button>
                <button type="button" onClick={() => remove(client)} className="h-9 border border-red-400/20 px-3 text-[10px] font-black uppercase tracking-wide text-red-300/70 hover:text-red-300">
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
