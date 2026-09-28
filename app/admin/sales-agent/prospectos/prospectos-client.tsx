"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SalesAgentHeader, INPUT, LABEL, POTENTIAL_LABEL, POTENTIAL_STYLE, STATUS_LABEL, CATEGORY_LABEL, TICKETING_LABEL } from "../nav";

type Prospect = {
  id: string; name: string; instagram_username: string | null; website: string | null; city: string | null; province: string | null;
  category: string | null; followers: number | null; events_per_month: number | null; email: string | null; phone: string | null; whatsapp: string | null;
  ticketing_provider: string | null; score: number; potential: string; status: string; next_followup_at: string | null;
};

export default function ProspectosClient() {
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("campaignId");

  const [prospects, setProspects] = useState<Prospect[] | null>(null);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState("");

  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [potential, setPotential] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (city) params.set("city", city);
      if (category) params.set("category", category);
      if (status) params.set("status", status);
      if (potential) params.set("potential", potential);
      if (campaignId) params.set("campaignId", campaignId);
      const response = await fetch(`/api/admin/sales-agent/prospectos?${params.toString()}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 503) setBlocked(result.error);
        throw new Error(result.error ?? "No se pudo cargar.");
      }
      setProspects(result.prospects);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    setProspects(null);
    load();
  }

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[1100px] px-5 py-8 md:px-8">
        <SalesAgentHeader active="prospectos" title="Prospectos." subtitle="Cada negocio que podría necesitar Capital Pass, con su puntaje y su estado en el proceso." />

        {blocked && <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">{blocked}</div>}
        {error && !blocked && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {!blocked && (
          <>
            <div className="mt-8 flex flex-wrap gap-2">
              <button type="button" onClick={() => setAddOpen(true)} className="h-11 bg-[#ff2a1a] px-5 text-[10px] font-black uppercase tracking-[0.16em] text-white hover:bg-[#ff4a2d]">+ Agregar prospecto</button>
              <button type="button" onClick={() => setImportOpen(true)} className="h-11 border border-white/[0.14] px-5 text-[10px] font-black uppercase tracking-[0.16em] text-white/70 hover:text-white">Importar CSV</button>
              <a href={`/api/admin/sales-agent/prospectos/exportar${campaignId ? `?campaignId=${campaignId}` : ""}`} className="h-11 inline-flex items-center border border-white/[0.14] px-5 text-[10px] font-black uppercase tracking-[0.16em] text-white/70 hover:text-white">Exportar CSV</a>
            </div>

            <form onSubmit={applyFilters} className="mt-6 grid gap-3 border border-white/[0.08] bg-white/[0.02] p-4 sm:grid-cols-5">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o Instagram…" className="h-11 border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50 sm:col-span-2" />
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ciudad" className="h-11 border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50" />
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-11 border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50">
                <option value="" className="bg-black">Todas las categorías</option>
                {Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k} className="bg-black">{l}</option>)}
              </select>
              <select value={potential} onChange={(e) => setPotential(e.target.value)} className="h-11 border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50">
                <option value="" className="bg-black">Todo el potencial</option>
                {Object.entries(POTENTIAL_LABEL).map(([k, l]) => <option key={k} value={k} className="bg-black">{l}</option>)}
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50 sm:col-span-2">
                <option value="" className="bg-black">Todos los estados</option>
                {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k} className="bg-black">{l}</option>)}
              </select>
              <button type="submit" className="h-11 border border-white/[0.14] px-4 text-[10px] font-black uppercase tracking-wide text-white/70 hover:text-white">Filtrar</button>
            </form>

            <div className="mt-6 space-y-2">
              {prospects === null ? (
                <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Cargando…</div>
              ) : prospects.length === 0 ? (
                <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">No hay prospectos con estos filtros.</div>
              ) : (
                prospects.map((p) => (
                  <a key={p.id} href={`/admin/sales-agent/prospectos/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 border border-white/[0.08] bg-white/[0.02] px-4 py-3 transition hover:border-white/25">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {p.name}
                        <span className={`ml-2 border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${POTENTIAL_STYLE[p.potential]}`}>{POTENTIAL_LABEL[p.potential]} · {p.score}</span>
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-white/40">
                        {[p.city, p.province].filter(Boolean).join(", ") || "Sin ubicación"}
                        {p.category ? ` · ${CATEGORY_LABEL[p.category] ?? p.category}` : ""}
                        {p.instagram_username ? ` · @${p.instagram_username}` : ""}
                        {p.ticketing_provider ? ` · ${TICKETING_LABEL[p.ticketing_provider] ?? p.ticketing_provider}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 border border-white/15 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white/50">{STATUS_LABEL[p.status] ?? p.status}</span>
                  </a>
                ))
              )}
            </div>
          </>
        )}
      </section>

      {addOpen && <AddProspectModal campaignId={campaignId} onClose={() => setAddOpen(false)} onCreated={() => { setAddOpen(false); load(); }} />}
      {importOpen && <ImportModal campaignId={campaignId} onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); load(); }} />}
    </main>
  );
}

function AddProspectModal({ campaignId, onClose, onCreated }: { campaignId: string | null; onClose: () => void; onCreated: () => void }) {
  const [fields, setFields] = useState({ name: "", instagramUsername: "", website: "", city: "", province: "", category: "", followers: "", eventsPerMonth: "", email: "", phone: "", whatsapp: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof typeof fields>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/sales-agent/prospectos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, campaignId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70 md:items-center md:justify-center" onClick={() => !saving && onClose()}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-[520px] overflow-y-auto border-t border-white/10 bg-[#0d0d0d] p-6 md:rounded-none">
        <h2 className="text-lg font-black">Agregar prospecto</h2>
        {error && <div className="mt-3 border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}

        <label className="mt-4 block"><span className={LABEL}>Nombre *</span><input value={fields.name} onChange={(e) => set("name", e.target.value)} className={INPUT} /></label>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <label className="mt-3 block"><span className={LABEL}>Instagram</span><input value={fields.instagramUsername} onChange={(e) => set("instagramUsername", e.target.value)} placeholder="@usuario" className={INPUT} /></label>
          <label className="mt-3 block"><span className={LABEL}>Web</span><input value={fields.website} onChange={(e) => set("website", e.target.value)} className={INPUT} /></label>
          <label className="mt-3 block"><span className={LABEL}>Ciudad</span><input value={fields.city} onChange={(e) => set("city", e.target.value)} className={INPUT} /></label>
          <label className="mt-3 block"><span className={LABEL}>Provincia</span><input value={fields.province} onChange={(e) => set("province", e.target.value)} className={INPUT} /></label>
          <label className="mt-3 block"><span className={LABEL}>Categoría</span>
            <select value={fields.category} onChange={(e) => set("category", e.target.value)} className={INPUT}>
              <option value="" className="bg-black">Elegir…</option>
              {Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k} className="bg-black">{l}</option>)}
            </select>
          </label>
          <label className="mt-3 block"><span className={LABEL}>Seguidores aprox.</span><input value={fields.followers} onChange={(e) => set("followers", e.target.value)} inputMode="numeric" className={INPUT} /></label>
          <label className="mt-3 block"><span className={LABEL}>Eventos por mes</span><input value={fields.eventsPerMonth} onChange={(e) => set("eventsPerMonth", e.target.value)} inputMode="numeric" className={INPUT} /></label>
          <label className="mt-3 block"><span className={LABEL}>Email</span><input value={fields.email} onChange={(e) => set("email", e.target.value)} className={INPUT} /></label>
          <label className="mt-3 block"><span className={LABEL}>Teléfono</span><input value={fields.phone} onChange={(e) => set("phone", e.target.value)} className={INPUT} /></label>
          <label className="mt-3 block"><span className={LABEL}>WhatsApp</span><input value={fields.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} className={INPUT} /></label>
        </div>
        <label className="mt-3 block"><span className={LABEL}>Notas</span><input value={fields.notes} onChange={(e) => set("notes", e.target.value)} className={INPUT} /></label>

        <div className="mt-5 flex gap-2">
          <button type="button" disabled={saving} onClick={onClose} className="h-12 flex-1 border border-white/15 text-[10px] font-black uppercase tracking-wide text-white/60">Cancelar</button>
          <button type="submit" disabled={saving || !fields.name.trim()} className="h-12 flex-[2] bg-[#ff2a1a] text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-40">{saving ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}

function ImportModal({ campaignId, onClose, onDone }: { campaignId: string | null; onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ processed: number; created: number; duplicates: number; errors: number } | null>(null);

  async function submit() {
    if (busy || !csv.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/sales-agent/prospectos/importar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, campaignId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo importar.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70 md:items-center md:justify-center" onClick={() => !busy && onClose()}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto border-t border-white/10 bg-[#0d0d0d] p-6">
        <h2 className="text-lg font-black">Importar CSV</h2>
        <p className="mt-1 text-xs text-white/40">Pegá el contenido del archivo. La primera fila tiene que tener los encabezados (nombre, instagram, web, ciudad, provincia, categoria, seguidores, eventospormes, email, telefono, whatsapp, notas). Solo &quot;nombre&quot; es obligatorio.</p>

        {error && <div className="mt-3 border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}

        {result ? (
          <div className="mt-4 border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
            Procesadas {result.processed} filas: {result.created} agregadas, {result.duplicates} ya existían, {result.errors} con error.
          </div>
        ) : (
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={10} placeholder={"nombre,instagram,ciudad,provincia\nClub Example,clubexample,Rosario,Santa Fe"} className="mt-3 w-full border border-white/[0.12] bg-black/30 px-3 py-2 font-mono text-xs text-white outline-none focus:border-[#ff5a2a]/50" />
        )}

        <div className="mt-5 flex gap-2">
          <button type="button" disabled={busy} onClick={result ? onDone : onClose} className="h-12 flex-1 border border-white/15 text-[10px] font-black uppercase tracking-wide text-white/60">{result ? "Listo" : "Cancelar"}</button>
          {!result && (
            <button type="button" disabled={busy || !csv.trim()} onClick={submit} className="h-12 flex-[2] bg-[#ff2a1a] text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-40">{busy ? "Importando…" : "Importar"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
