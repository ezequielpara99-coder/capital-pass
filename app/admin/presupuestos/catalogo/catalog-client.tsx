"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { formatMoney, KIND_LABEL, QUOTE_KINDS, UNITS, type QuoteKind } from "../../../../lib/quotes/totals";
import type { CatalogItem } from "../quote-editor";

const INPUT =
  "mt-2 h-12 w-full border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50";
const LABEL = "block text-[9px] font-black uppercase tracking-[0.18em] text-white/40";

function draftFrom(item?: CatalogItem) {
  return {
    description: item?.description ?? "",
    unit: item?.unit ?? "u",
    unitPrice: item?.unit_price_minor ? String(item.unit_price_minor) : "",
  };
}

export default function CatalogClient({ items, missingSql }: { items: CatalogItem[]; missingSql: boolean }) {
  const [rows, setRows] = useState(items);
  const [kind, setKind] = useState<QuoteKind>("diseno");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(draftFrom());

  function startEdit(item: CatalogItem) {
    setEditingId(item.id);
    setKind(item.kind);
    setDraft(draftFrom(item));
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(draftFrom());
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/presupuestos/catalogo", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          kind,
          description: draft.description,
          unit: draft.unit,
          unitPrice: draft.unitPrice,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");

      if (editingId) {
        setRows((prev) => prev.map((row) => (row.id === editingId ? result.item : row)));
        setEditingId(null);
      } else {
        setRows((prev) => [...prev, result.item]);
      }
      setDraft(draftFrom());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: CatalogItem) {
    if (!window.confirm(`¿Sacar "${item.description}" del catálogo?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/admin/presupuestos/catalogo?id=${item.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo borrar.");
      setRows((prev) => prev.filter((row) => row.id !== item.id));
      if (editingId === item.id) cancelEdit();
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
          <h1 className="mt-3 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Catálogo.</h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">Ítems que usás seguido (flyers, videos, terminales…). Al armar un presupuesto los sumás con un toque.</p>
        </header>

        {missingSql && (
          <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Falta aplicar la actualización de la base de datos de presupuestos (20260938).
          </div>
        )}
        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <form onSubmit={submit} className="mt-8 border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">{editing ? "Editando ítem" : "Nuevo ítem"}</p>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {QUOTE_KINDS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setKind(value)}
                className={`h-11 border text-[10px] font-black uppercase tracking-[0.1em] transition ${
                  kind === value ? "border-white/50 bg-white/10 text-white" : "border-white/[0.12] text-white/40 hover:text-white"
                }`}
              >
                {KIND_LABEL[value]}
              </button>
            ))}
          </div>

          <label className="mt-3 block">
            <span className={LABEL}>Descripción</span>
            <input
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              required
              className={INPUT}
              placeholder="Flyer de preventa"
            />
          </label>

          <div className="grid grid-cols-2 gap-x-4">
            <label className="mt-1 block">
              <span className={LABEL}>Unidad</span>
              <select value={draft.unit} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))} className={INPUT}>
                {UNITS.map((unit) => (
                  <option key={unit} value={unit} className="bg-[#0a0908]">
                    {unit}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-1 block">
              <span className={LABEL}>Precio ($)</span>
              <input
                value={draft.unitPrice}
                onChange={(e) => setDraft((d) => ({ ...d, unitPrice: e.target.value }))}
                inputMode="numeric"
                className={INPUT}
                placeholder="0"
              />
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={busy} className="h-12 flex-1 bg-[#ff2a1a] text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d] disabled:opacity-40">
              {busy ? "Guardando…" : editing ? "Guardar cambios" : "+ Agregar al catálogo"}
            </button>
            {editing && (
              <button type="button" onClick={cancelEdit} className="h-12 border border-white/[0.14] px-5 text-[10px] font-black uppercase tracking-[0.14em] text-white/60 hover:text-white">
                Cancelar
              </button>
            )}
          </div>
        </form>

        {rows.length === 0 ? (
          <div className="mt-6 border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">El catálogo está vacío.</div>
        ) : (
          <div className="mt-6 space-y-2">
            {rows.map((item) => (
              <div key={item.id} className="flex items-center gap-3 border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{item.description}</p>
                  <p className="text-[10px] uppercase tracking-wide text-white/35">
                    {KIND_LABEL[item.kind]} · {item.unit}
                  </p>
                </div>
                <p className="text-sm font-black">{item.unit_price_minor ? formatMoney(item.unit_price_minor) : "—"}</p>
                <button type="button" onClick={() => startEdit(item)} className="h-9 border border-white/15 px-3 text-[10px] font-black uppercase tracking-wide text-white/60 hover:border-white/40 hover:text-white">
                  Editar
                </button>
                <button type="button" onClick={() => remove(item)} className="h-9 border border-red-400/20 px-3 text-[10px] font-black uppercase tracking-wide text-red-300/70 hover:text-red-300">
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
