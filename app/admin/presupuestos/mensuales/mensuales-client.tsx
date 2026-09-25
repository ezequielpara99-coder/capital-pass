"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { formatMoney, KIND_LABEL, QUOTE_KINDS, quoteCode, STATUS_LABEL, type QuoteKind, type QuoteStatus } from "../../../../lib/quotes/totals";

type Period = { period: string; quoteId: string; status: QuoteStatus; number: number };
type Pack = {
  id: string;
  client_name: string;
  client_contact: string | null;
  client_phone: string | null;
  client_email: string | null;
  kind: QuoteKind;
  description: string | null;
  package_price_minor: number;
  active: boolean;
  notes: string | null;
  periods: Period[];
};

const INPUT =
  "mt-2 h-12 w-full border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50";
const LABEL = "block text-[9px] font-black uppercase tracking-[0.18em] text-white/40";

function emptyDraft() {
  return { clientName: "", clientContact: "", clientPhone: "", clientEmail: "", kind: "diseno" as QuoteKind, description: "", packagePrice: "", notes: "" };
}

function currentPeriodLabel() {
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(new Date());
}

function periodLabel(value: string) {
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function currentPeriodValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function MensualesClient() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missingSql, setMissingSql] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/presupuestos/packs-mensuales");
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 503) setMissingSql(true);
        throw new Error(result.error ?? "No se pudo cargar.");
      }
      setPacks(result.packs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  function startEdit(pack: Pack) {
    setEditingId(pack.id);
    setDraft({
      clientName: pack.client_name,
      clientContact: pack.client_contact ?? "",
      clientPhone: pack.client_phone ?? "",
      clientEmail: pack.client_email ?? "",
      kind: pack.kind,
      description: pack.description ?? "",
      packagePrice: pack.package_price_minor ? String(pack.package_price_minor) : "",
      notes: pack.notes ?? "",
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
      const response = await fetch("/api/admin/presupuestos/packs-mensuales", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(editingId ? { id: editingId } : {}), ...draft }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");
      cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(pack: Pack) {
    setError("");
    try {
      const response = await fetch("/api/admin/presupuestos/packs-mensuales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pack.id, active: !pack.active }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    }
  }

  async function remove(pack: Pack) {
    if (!window.confirm(`¿Borrar el pack mensual de "${pack.client_name}"?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/admin/presupuestos/packs-mensuales?id=${pack.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo borrar.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    }
  }

  async function generate(pack: Pack) {
    setGeneratingId(pack.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/presupuestos/packs-mensuales/${pack.id}/generar`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo generar la factura.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar la factura.");
    } finally {
      setGeneratingId(null);
    }
  }

  const editing = editingId !== null;
  const thisMonth = currentPeriodValue();

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href="/admin/presupuestos" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Presupuestos
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass admin</p>
          <h1 className="mt-3 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Packs mensuales.</h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">
            Clientes que pagan un monto fijo todos los meses. Guardalo una vez y cada mes generás la factura con un click, sin volver a cargar todo.
          </p>
        </header>

        {missingSql && (
          <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Falta aplicar la actualización de la base de datos de packs mensuales (20260968).
          </div>
        )}
        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <form onSubmit={submit} className="mt-8 border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">{editing ? "Editando pack" : "Nuevo pack mensual"}</p>

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
            <span className={LABEL}>Cliente *</span>
            <input value={draft.clientName} onChange={(e) => setDraft((d) => ({ ...d, clientName: e.target.value }))} className={INPUT} placeholder="Bar Los Álamos" />
          </label>

          <div className="grid gap-x-4 sm:grid-cols-2">
            <label className="mt-3 block">
              <span className={LABEL}>Contacto</span>
              <input value={draft.clientContact} onChange={(e) => setDraft((d) => ({ ...d, clientContact: e.target.value }))} className={INPUT} />
            </label>
            <label className="mt-3 block">
              <span className={LABEL}>Teléfono</span>
              <input value={draft.clientPhone} onChange={(e) => setDraft((d) => ({ ...d, clientPhone: e.target.value }))} inputMode="tel" className={INPUT} />
            </label>
          </div>

          <label className="mt-3 block">
            <span className={LABEL}>Email</span>
            <input value={draft.clientEmail} onChange={(e) => setDraft((d) => ({ ...d, clientEmail: e.target.value }))} inputMode="email" className={INPUT} />
          </label>

          <div className="grid gap-x-4 sm:grid-cols-2">
            <label className="mt-3 block">
              <span className={LABEL}>Qué incluye</span>
              <input value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} className={INPUT} placeholder="4 flyers + 2 videos por mes" />
            </label>
            <label className="mt-3 block">
              <span className={LABEL}>Monto mensual ($) *</span>
              <input value={draft.packagePrice} onChange={(e) => setDraft((d) => ({ ...d, packagePrice: e.target.value }))} inputMode="numeric" className={INPUT} placeholder="150000" />
            </label>
          </div>

          <label className="mt-3 block">
            <span className={LABEL}>Notas</span>
            <input value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} className={INPUT} />
          </label>

          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={saving} className="h-12 flex-1 bg-[#ff2a1a] text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d] disabled:opacity-40">
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "+ Agregar pack mensual"}
            </button>
            {editing && (
              <button type="button" onClick={cancelEdit} className="h-12 border border-white/[0.14] px-5 text-[10px] font-black uppercase tracking-[0.14em] text-white/60 hover:text-white">
                Cancelar
              </button>
            )}
          </div>
        </form>

        <div className="mt-8 space-y-3">
          {loading && <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Cargando…</div>}

          {!loading && packs.length === 0 && (
            <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Todavía no hay packs mensuales.</div>
          )}

          {packs.map((pack) => {
            const alreadyGenerated = pack.periods.some((p) => p.period === thisMonth);
            const lastQuote = pack.periods.find((p) => p.period === thisMonth);
            return (
              <div key={pack.id} className={`border bg-white/[0.02] p-4 ${pack.active ? "border-white/[0.08]" : "border-white/[0.05] opacity-50"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">
                      {pack.client_name} <span className="text-white/30">· {KIND_LABEL[pack.kind]}</span>
                      {!pack.active && <span className="ml-2 text-[10px] font-black uppercase text-white/30">Inactivo</span>}
                    </p>
                    {pack.description && <p className="mt-0.5 text-[11px] text-white/35">{pack.description}</p>}
                  </div>
                  <p className="shrink-0 text-sm font-black">{formatMoney(pack.package_price_minor)}<span className="text-[10px] font-bold text-white/30">/mes</span></p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {alreadyGenerated && lastQuote ? (
                    <Link
                      href={`/admin/presupuestos/${lastQuote.quoteId}`}
                      className="h-9 flex items-center border border-emerald-400/30 bg-emerald-400/10 px-3 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-300"
                    >
                      ✓ {currentPeriodLabel()} generada · {STATUS_LABEL[lastQuote.status]}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => generate(pack)}
                      disabled={!pack.active || generatingId === pack.id}
                      className="h-9 border border-emerald-400/30 bg-emerald-400/10 px-3 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-40"
                    >
                      {generatingId === pack.id ? "Generando…" : `Generar factura de ${currentPeriodLabel()}`}
                    </button>
                  )}
                  <button type="button" onClick={() => startEdit(pack)} className="h-9 border border-white/15 px-3 text-[10px] font-black uppercase tracking-wide text-white/60 hover:border-white/40 hover:text-white">
                    Editar
                  </button>
                  <button type="button" onClick={() => toggleActive(pack)} className="h-9 border border-white/15 px-3 text-[10px] font-black uppercase tracking-wide text-white/60 hover:border-white/40 hover:text-white">
                    {pack.active ? "Desactivar" : "Reactivar"}
                  </button>
                  <button type="button" onClick={() => remove(pack)} className="h-9 border border-red-400/20 px-3 text-[10px] font-black uppercase tracking-wide text-red-300/70 hover:text-red-300">
                    Quitar
                  </button>
                </div>

                {pack.periods.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/[0.06] pt-2 text-[11px]">
                    {pack.periods.map((p) => (
                      <Link key={p.quoteId} href={`/admin/presupuestos/${p.quoteId}`} className="text-white/35 underline decoration-white/20 hover:text-white">
                        {periodLabel(p.period)} · {quoteCode(p.number)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
