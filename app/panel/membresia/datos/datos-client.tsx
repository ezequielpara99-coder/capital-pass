"use client";

import { useEffect, useState } from "react";
import { MembresiaHeader, formatMoney } from "../membresia-nav";

type Metrics = {
  members: { total: number; active: number; wallet_total_minor: number; points_total: number };
  period: { orders: number; delivered: number; cancelled: number; revenue_minor: number; points_given: number; buyers: number };
  top_spenders: { id: string; name: string; code: string; spent_minor: number; orders: number }[];
  top_points: { id: string; name: string; code: string; points_balance: number }[];
  top_products: { name: string; qty: number; revenue_minor: number }[];
  attendance: { id: string; name: string; members: number }[];
  top_attendees: { id: string; name: string; code: string; visits: number }[];
};

const PERIODS = [
  { id: "month", label: "Este mes" },
  { id: "30d", label: "30 días" },
  { id: "7d", label: "7 días" },
  { id: "all", label: "Todo" },
] as const;

function Stat({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border border-white/[0.08] bg-white/[0.02] px-4 py-4">
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">{label}</p>
      <p className={`mt-2 text-2xl font-black ${tone}`}>{value}</p>
    </div>
  );
}

function Ranking<T extends { id?: string; name: string }>({ title, rows, render, empty }: { title: string; rows: T[]; render: (row: T) => string; empty: string }) {
  return (
    <div className="border border-white/[0.08] bg-white/[0.02] p-4">
      <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff7354]">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-white/30">{empty}</p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {rows.map((row, index) => (
            <li key={`${row.name}-${index}`} className="flex items-center gap-3 text-sm">
              <span className="w-5 shrink-0 text-right font-black text-white/30">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate font-bold">{row.name}</span>
              <span className="shrink-0 text-xs text-white/55">{render(row)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function DatosClient() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("month");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/panel/membresia-metricas?period=${period}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 403 || response.status === 503) setBlocked(result.error);
          throw new Error(result.error ?? "No se pudo cargar.");
        }
        if (!cancelled) {
          setMetrics(result.metrics);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar.");
      }
    })();
    return () => { cancelled = true; };
  }, [period]);

  const featured = metrics?.top_spenders[0];
  const avgTicket = metrics && metrics.period.delivered > 0 ? Math.round(Number(metrics.period.revenue_minor) / metrics.period.delivered) : 0;

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <MembresiaHeader active="datos" title="Datos de socios." subtitle="Quiénes compran, quién tiene más puntos, tu cliente destacado y qué se pide más." />

        {blocked && <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">{blocked}</div>}
        {error && !blocked && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {!blocked && (
          <>
            <div className="mt-6 flex flex-wrap gap-2">
              {PERIODS.map((p) => (
                <button key={p.id} type="button" onClick={() => { setMetrics(null); setPeriod(p.id); }} className={`h-10 border px-4 text-[10px] font-black uppercase tracking-[0.14em] ${period === p.id ? "border-[#ff5a2a]/60 bg-[#ff5a2a]/10 text-white" : "border-white/[0.10] text-white/45"}`}>
                  {p.label}
                </button>
              ))}
            </div>

            {!metrics && !error && <div className="mt-6 border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Cargando…</div>}

            {metrics && (
              <>
                {featured && (
                  <div className="mt-6 border border-amber-400/30 bg-gradient-to-r from-amber-400/[0.10] to-transparent px-5 py-5">
                    <p className="text-[9px] font-black uppercase tracking-[0.22em] text-amber-300">Cliente destacado</p>
                    <p className="mt-2 text-2xl font-black">{featured.name}</p>
                    <p className="mt-1 text-sm text-white/55">
                      {formatMoney(Number(featured.spent_minor))} en {featured.orders} {featured.orders === 1 ? "pedido" : "pedidos"} · código {featured.code}
                    </p>
                  </div>
                )}

                <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat label="Socios activos" value={`${metrics.members.active} / ${metrics.members.total}`} />
                  <Stat label="Ventas por la app" value={formatMoney(Number(metrics.period.revenue_minor))} tone="text-emerald-300" />
                  <Stat label="Pedidos entregados" value={String(metrics.period.delivered)} />
                  <Stat label="Ticket promedio" value={formatMoney(avgTicket)} />
                  <Stat label="Socios que compraron" value={String(metrics.period.buyers)} />
                  <Stat label="Puntos otorgados" value={String(metrics.period.points_given)} tone="text-violet-300" />
                  <Stat label="Puntos en circulación" value={String(metrics.members.points_total)} tone="text-violet-300" />
                  <Stat label="Saldo en billeteras" value={formatMoney(Number(metrics.members.wallet_total_minor))} />
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <Ranking title="Quienes más compran" rows={metrics.top_spenders} render={(r) => formatMoney(Number(r.spent_minor))} empty="Todavía no hay compras en este período." />
                  <Ranking title="Más puntos acumulados" rows={metrics.top_points} render={(r) => `${r.points_balance} pts`} empty="Todavía nadie tiene puntos." />
                  <Ranking title="Lo más pedido" rows={metrics.top_products} render={(r) => `${r.qty} u. · ${formatMoney(Number(r.revenue_minor))}`} empty="Todavía no hay pedidos entregados." />
                  <Ranking title="Socios más fieles (asistencias)" rows={metrics.top_attendees} render={(r) => `${r.visits} ${r.visits === 1 ? "fiesta" : "fiestas"}`} empty="Todavía no hay asistencias registradas." />
                </div>

                <div className="mt-4">
                  <Ranking title="Asistencia de socios por fiesta" rows={metrics.attendance} render={(r) => `${r.members} socios`} empty="Cuando la puerta escanee carnets, vas a ver acá cuántos socios vinieron a cada fiesta." />
                </div>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
