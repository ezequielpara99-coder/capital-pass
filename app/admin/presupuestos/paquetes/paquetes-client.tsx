"use client";

import Link from "next/link";
import { useState } from "react";
import { formatMoney, itemTotal, KIND_LABEL, QUOTE_KINDS, type PriceMode, type QuoteItem, type QuoteKind } from "../../../../lib/quotes/totals";

export type QuotePackage = {
  id: string;
  kind: QuoteKind;
  name: string;
  items: QuoteItem[];
  price_mode: PriceMode;
  package_price_minor: number;
  notes: string | null;
  active: boolean;
};

const INPUT =
  "mt-2 h-12 w-full border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50";
const LABEL = "block text-[9px] font-black uppercase tracking-[0.18em] text-white/40";

type EditorItem = { key: string; description: string; quantity: string; unit: string; price: string };

let keyCounter = 0;
const nextKey = () => `p${Date.now()}-${keyCounter++}`;

function toNumber(value: string) {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyItem(): EditorItem {
  return { key: nextKey(), description: "", quantity: "1", unit: "u", price: "" };
}

function itemsToEditor(items: QuoteItem[]): EditorItem[] {
  return items.length > 0
    ? items.map((item) => ({ key: nextKey(), description: item.description, quantity: String(item.quantity), unit: item.unit, price: item.unit_price_minor ? String(item.unit_price_minor) : "" }))
    : [emptyItem()];
}

function draftFrom(pkg?: QuotePackage) {
  return {
    kind: pkg?.kind ?? ("diseno" as QuoteKind),
    name: pkg?.name ?? "",
    priceMode: pkg?.price_mode ?? ("package" as PriceMode),
    packagePrice: pkg?.package_price_minor ? String(pkg.package_price_minor) : "",
    items: itemsToEditor(pkg?.items ?? []),
    notes: pkg?.notes ?? "",
  };
}

export default function PaquetesClient({ packages, missingSql }: { packages: QuotePackage[]; missingSql: boolean }) {
  const [rows, setRows] = useState(packages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(draftFrom());

  const showPrices = draft.priceMode === "items";

  function startNew() {
    setEditingId(null);
    setDraft(draftFrom());
  }

  function startEdit(pkg: QuotePackage) {
    setEditingId(pkg.id);
    setDraft(draftFrom(pkg));
  }

  function updateItem(key: string, patch: Partial<EditorItem>) {
    setDraft((d) => ({ ...d, items: d.items.map((item) => (item.key === key ? { ...item, ...patch } : item)) }));
  }

  function removeItem(key: string) {
    setDraft((d) => ({ ...d, items: d.items.length > 1 ? d.items.filter((item) => item.key !== key) : [emptyItem()] }));
  }

  async function submit() {
    if (!draft.name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const items = draft.items
        .filter((item) => item.description.trim())
        .map((item) => ({
          description: item.description.trim(),
          quantity: toNumber(item.quantity) > 0 ? toNumber(item.quantity) : 1,
          unit: item.unit,
          unit_price_minor: Math.max(0, Math.round(toNumber(item.price))),
        }));

      const response = await fetch("/api/admin/presupuestos/paquetes", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          kind: draft.kind,
          name: draft.name,
          priceMode: draft.priceMode,
          packagePrice: Math.round(toNumber(draft.packagePrice)),
          items,
          notes: draft.notes,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");

      // package_price_minor es bigint: PostgREST lo devuelve como string,
      // no como number -- se normaliza para que un paquete de precio 0
      // no quede truthy y muestre un monto donde deberia mostrar "—".
      const pkg = { ...result.package, package_price_minor: Number(result.package.package_price_minor) };

      if (editingId) {
        setRows((prev) => prev.map((row) => (row.id === editingId ? pkg : row)));
      } else {
        setRows((prev) => [...prev, pkg]);
      }
      startNew();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(pkg: QuotePackage) {
    if (!window.confirm(`¿Borrar el paquete "${pkg.name}"?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/admin/presupuestos/paquetes?id=${pkg.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo borrar.");
      setRows((prev) => prev.filter((row) => row.id !== pkg.id));
      if (editingId === pkg.id) startNew();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    }
  }

  const editing = editingId !== null;
  const total = showPrices
    ? draft.items.reduce((sum, item) => sum + itemTotal({ quantity: toNumber(item.quantity) || 1, unit_price_minor: toNumber(item.price) }), 0)
    : Math.round(toNumber(draft.packagePrice));

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href="/admin/presupuestos" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Presupuestos
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass admin</p>
          <h1 className="mt-3 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Paquetes.</h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">
            Armá paquetes predeterminados (&quot;Emprendedores&quot;, &quot;Boliches&quot;...) con su contenido y precio. Al hacer un presupuesto nuevo, los elegís con un toque.
          </p>
        </header>

        {missingSql && (
          <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Falta aplicar la actualización de la base de datos de paquetes (20260944).
          </div>
        )}
        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <div className="mt-8 border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">{editing ? "Editando paquete" : "Nuevo paquete"}</p>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {QUOTE_KINDS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, kind: value }))}
                className={`h-11 border text-[10px] font-black uppercase tracking-[0.1em] transition ${
                  draft.kind === value ? "border-white/50 bg-white/10 text-white" : "border-white/[0.12] text-white/40 hover:text-white"
                }`}
              >
                {KIND_LABEL[value]}
              </button>
            ))}
          </div>

          <label className="mt-3 block">
            <span className={LABEL}>Nombre del paquete *</span>
            <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className={INPUT} placeholder="Paquete Emprendedores" />
          </label>

          <div className="mt-4 flex items-center justify-between gap-3">
            <span className={LABEL}>Contenido</span>
            <div className="grid grid-cols-2 gap-1 border border-white/[0.12] p-1 text-[9px] font-black uppercase tracking-[0.1em]">
              {(["package", "items"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, priceMode: mode }))}
                  className={`h-9 px-3 transition ${draft.priceMode === mode ? "bg-white text-black" : "text-white/45 hover:text-white"}`}
                >
                  {mode === "package" ? "Precio cerrado" : "Precio por ítem"}
                </button>
              ))}
            </div>
          </div>

          {!showPrices && (
            <label className="mt-3 block">
              <span className={LABEL}>Precio total del paquete ($)</span>
              <input value={draft.packagePrice} onChange={(e) => setDraft((d) => ({ ...d, packagePrice: e.target.value }))} inputMode="numeric" className={INPUT} placeholder="60000" />
            </label>
          )}

          <div className="mt-3 space-y-2">
            {draft.items.map((item, index) => (
              <div key={item.key} className="border border-white/[0.08] bg-white/[0.02] p-2.5">
                <div className="flex items-start gap-2">
                  <span className="mt-3 w-4 shrink-0 text-xs font-black text-white/25">{index + 1}</span>
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(item.key, { description: e.target.value })}
                    placeholder="Ej: Flyer semanal"
                    className="h-11 min-w-0 flex-1 border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#ff5a2a]/50"
                  />
                  <button type="button" onClick={() => removeItem(item.key)} className="h-11 w-11 shrink-0 border border-white/[0.10] text-lg text-white/40 hover:text-red-300">
                    ×
                  </button>
                </div>
                <div className="mt-2 flex gap-2 pl-6">
                  <input
                    value={item.quantity}
                    onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                    inputMode="decimal"
                    aria-label="Cantidad"
                    className="h-11 w-20 shrink-0 border border-white/[0.12] bg-black/30 px-2 text-center text-sm text-white outline-none focus:border-[#ff5a2a]/50"
                  />
                  {showPrices && (
                    <input
                      value={item.price}
                      onChange={(e) => updateItem(item.key, { price: e.target.value })}
                      inputMode="numeric"
                      placeholder="Precio ($)"
                      aria-label="Precio"
                      className="h-11 min-w-0 flex-1 border border-white/[0.12] bg-black/30 px-2 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#ff5a2a]/50"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, items: [...d.items, emptyItem()] }))}
            className="mt-3 h-10 border border-white/[0.14] px-4 text-[10px] font-black uppercase tracking-[0.12em] text-white/70 transition hover:border-white/40 hover:text-white"
          >
            + Agregar ítem
          </button>

          <label className="mt-4 block">
            <span className={LABEL}>Notas por defecto (detalle del servicio, condiciones especiales…)</span>
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              rows={6}
              className="mt-2 w-full border border-white/[0.12] bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50"
              placeholder="Se copia al presupuesto cuando elegís este paquete. Podés editarlo ahí sin afectar la plantilla."
            />
          </label>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
            <p className="text-sm text-white/50">
              Total: <span className="font-black text-white">{formatMoney(total)}</span>
            </p>
            <div className="flex gap-2">
              {editing && (
                <button type="button" onClick={startNew} className="h-11 border border-white/[0.14] px-4 text-[10px] font-black uppercase tracking-[0.14em] text-white/60 hover:text-white">
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={busy || !draft.name.trim()}
                className="h-11 bg-[#ff2a1a] px-6 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d] disabled:opacity-40"
              >
                {busy ? "Guardando…" : editing ? "Guardar cambios" : "+ Crear paquete"}
              </button>
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="mt-6 border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Todavía no hay paquetes predeterminados.</div>
        ) : (
          <div className="mt-6 space-y-2">
            {rows.map((pkg) => (
              <div key={pkg.id} className="flex items-center gap-3 border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{pkg.name}</p>
                  <p className="text-[10px] uppercase tracking-wide text-white/35">
                    {KIND_LABEL[pkg.kind]} · {pkg.items.length} {pkg.items.length === 1 ? "ítem" : "ítems"}
                  </p>
                </div>
                <p className="text-sm font-black">
                  {formatMoney(pkg.price_mode === "package" ? pkg.package_price_minor : pkg.items.reduce((sum, item) => sum + itemTotal(item), 0))}
                </p>
                <button type="button" onClick={() => startEdit(pkg)} className="h-9 border border-white/15 px-3 text-[10px] font-black uppercase tracking-wide text-white/60 hover:border-white/40 hover:text-white">
                  Editar
                </button>
                <button type="button" onClick={() => remove(pkg)} className="h-9 border border-red-400/20 px-3 text-[10px] font-black uppercase tracking-wide text-red-300/70 hover:text-red-300">
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
