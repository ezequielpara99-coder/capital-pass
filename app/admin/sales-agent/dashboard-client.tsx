"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SalesAgentHeader } from "./nav";

type Stats = {
  totals: { prospects: number; newThisWeek: number; contacted: number; responded: number; interested: number; demos: number; clients: number; converted: number; conversionRate: number };
  funnel: { stage: string; count: number }[];
};

const STAGE_LABEL: Record<string, string> = {
  nuevo: "Prospectos", investigando: "Investigando", calificado: "Calificados", listo_para_contactar: "Listos para contactar",
  contactado: "Contactados", respondio: "Respondieron", interesado: "Interesados", demo: "Demo", negociacion: "Negociación", cliente: "Clientes",
};

export default function SalesAgentDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/admin/sales-agent/stats", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 503) setBlocked(result.error);
          throw new Error(result.error ?? "No se pudo cargar.");
        }
        if (!cancelled) setStats(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const maxFunnel = Math.max(1, ...(stats?.funnel.map((f) => f.count) ?? [1]));

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[1000px] px-5 py-8 md:px-8">
        <SalesAgentHeader active="dashboard" title="Sales Agent." subtitle="Prospección comercial asistida para conseguir clientes de Capital Pass." />

        {blocked && <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">{blocked}</div>}
        {error && !blocked && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {!blocked && (
          <>
            <div className="mt-8 flex flex-wrap gap-2">
              <Link href="/admin/sales-agent/campanas/nueva" className="inline-flex h-12 items-center bg-[#ff2a1a] px-6 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d]">
                + Nueva campaña
              </Link>
              <Link href="/admin/sales-agent/prospectos" className="inline-flex h-12 items-center border border-white/[0.14] px-6 text-[10px] font-black uppercase tracking-[0.16em] text-white/70 hover:text-white">
                Ver todos los prospectos
              </Link>
            </div>

            {!stats ? (
              <div className="mt-8 border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Cargando…</div>
            ) : (
              <>
                <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Prospectos" value={stats.totals.prospects} />
                  <Stat label="Nuevos esta semana" value={stats.totals.newThisWeek} />
                  <Stat label="Contactados" value={stats.totals.contacted} />
                  <Stat label="Respondieron" value={stats.totals.responded} />
                  <Stat label="Interesados" value={stats.totals.interested} />
                  <Stat label="Demos" value={stats.totals.demos} />
                  <Stat label="Clientes" value={stats.totals.clients} tone="text-emerald-300" />
                  <Stat label="Conversión" value={`${stats.totals.conversionRate}%`} tone="text-emerald-300" />
                </div>

                <div className="mt-8 border border-white/[0.08] bg-white/[0.02] p-5">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Embudo</p>
                  <div className="mt-4 space-y-2">
                    {stats.funnel.map((f) => (
                      <div key={f.stage} className="flex items-center gap-3">
                        <span className="w-40 shrink-0 text-[11px] text-white/50">{STAGE_LABEL[f.stage] ?? f.stage}</span>
                        <div className="h-6 flex-1 bg-white/[0.04]">
                          <div className="h-6 bg-gradient-to-r from-[#ff2a1a] to-[#ff7354]" style={{ width: `${Math.max(2, Math.round((f.count / maxFunnel) * 100))}%` }} />
                        </div>
                        <span className="w-10 shrink-0 text-right text-sm font-black">{f.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value, tone = "text-white" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="border border-white/[0.08] bg-white/[0.02] px-4 py-4">
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">{label}</p>
      <p className={`mt-2 text-2xl font-black ${tone}`}>{value}</p>
    </div>
  );
}
