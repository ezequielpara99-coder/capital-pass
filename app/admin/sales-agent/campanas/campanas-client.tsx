"use client";

import { useEffect, useState } from "react";
import { SalesAgentHeader } from "../nav";

type Campaign = {
  id: string; name: string; city: string | null; province: string | null; categories: string[];
  min_score: number; target_count: number | null; channel: string; message_style: string; status: string;
  prospects: number; qualified: number;
};

export default function CampanasClient() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const response = await fetch("/api/admin/sales-agent/campanas", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo cargar.");
      setCampaigns(result.campaigns);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function setStatus(campaign: Campaign, status: string) {
    setBusyId(campaign.id);
    setError("");
    try {
      const response = await fetch("/api/admin/sales-agent/campanas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: campaign.id, status }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar.");
      setCampaigns((prev) => (prev ?? []).map((c) => (c.id === campaign.id ? { ...c, status: result.campaign.status } : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <SalesAgentHeader active="campanas" title="Campañas." subtitle="Agrupá prospectos por objetivo: ciudad, rubro, puntaje mínimo y estilo de mensaje." />

        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <a href="/admin/sales-agent/campanas/nueva" className="mt-8 inline-flex h-12 items-center bg-[#ff2a1a] px-6 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d]">
          + Nueva campaña
        </a>

        <div className="mt-6 space-y-2">
          {campaigns === null ? (
            <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Cargando…</div>
          ) : campaigns.length === 0 ? (
            <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Todavía no hay campañas.</div>
          ) : (
            campaigns.map((c) => (
              <div key={c.id} className="border border-white/[0.08] bg-white/[0.02] px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">
                      {c.name} <span className={`ml-2 border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${c.status === "activa" ? "border-emerald-400/30 text-emerald-300" : c.status === "pausada" ? "border-amber-400/30 text-amber-300" : "border-white/15 text-white/40"}`}>{c.status}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/40">
                      {[c.city, c.province].filter(Boolean).join(", ") || "Sin ubicación"} · {c.categories.join(", ") || "todas las categorías"} · puntaje mín. {c.min_score}
                      {c.target_count ? ` · objetivo ${c.target_count}` : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/40">{c.prospects} prospectos · {c.qualified} calificados (score ≥ 61)</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={`/admin/sales-agent/prospectos?campaignId=${c.id}`} className="h-9 border border-white/15 px-3 text-[9px] font-black uppercase tracking-wide leading-9 text-white/60 hover:text-white">Ver prospectos</a>
                    {c.status !== "activa" && (
                      <button type="button" disabled={busyId === c.id} onClick={() => setStatus(c, "activa")} className="h-9 border border-emerald-400/25 px-3 text-[9px] font-black uppercase tracking-wide text-emerald-300 disabled:opacity-40">Activar</button>
                    )}
                    {c.status === "activa" && (
                      <button type="button" disabled={busyId === c.id} onClick={() => setStatus(c, "pausada")} className="h-9 border border-amber-400/25 px-3 text-[9px] font-black uppercase tracking-wide text-amber-300 disabled:opacity-40">Pausar</button>
                    )}
                    {c.status !== "cerrada" && (
                      <button type="button" disabled={busyId === c.id} onClick={() => setStatus(c, "cerrada")} className="h-9 border border-white/15 px-3 text-[9px] font-black uppercase tracking-wide text-white/50 disabled:opacity-40">Cerrar</button>
                    )}
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
