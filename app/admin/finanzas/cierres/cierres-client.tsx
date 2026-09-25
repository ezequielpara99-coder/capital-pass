"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "../../../../lib/quotes/totals";

type Closure = {
  id: string;
  period: string;
  presupuestado: number;
  facturado: number;
  cobrado: number;
  pendiente: number;
  gastos: number;
  resultado: number;
  closedAt: string;
};

function periodLabel(value: string) {
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export default function CierresClient() {
  const [closures, setClosures] = useState<Closure[] | null>(null);
  const [suggestedPeriod, setSuggestedPeriod] = useState("");
  const [error, setError] = useState("");
  const [missingSql, setMissingSql] = useState(false);
  const [closing, setClosing] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/admin/finanzas/cierres");
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 503) setMissingSql(true);
        throw new Error(result.error ?? "No se pudo cargar.");
      }
      setClosures(result.closures);
      setSuggestedPeriod(result.suggestedPeriod);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const alreadyClosedSuggested = closures?.some((c) => c.period === suggestedPeriod) ?? false;

  async function closeMonth(period: string) {
    if (closing) return;
    if (!window.confirm(`¿Cerrar ${periodLabel(period)}? Los números de ese mes quedan fijos.`)) return;
    setClosing(true);
    setError("");
    try {
      const response = await fetch("/api/admin/finanzas/cierres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo cerrar el mes.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar el mes.");
    } finally {
      setClosing(false);
    }
  }

  async function reopen(closure: Closure) {
    if (!window.confirm(`¿Reabrir ${periodLabel(closure.period)}? Vas a tener que volver a cerrarlo cuando corrijas lo que haga falta.`)) return;
    setError("");
    try {
      const response = await fetch(`/api/admin/finanzas/cierres?id=${closure.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo reabrir.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reabrir.");
    }
  }

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href="/admin/finanzas" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Finanzas
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass admin</p>
          <h1 className="mt-3 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Cierre mensual.</h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">
            Al cerrar un mes, sus números quedan fijos para siempre, aunque después edites un presupuesto o un gasto viejo. Sirve como libro contable mes a mes.
          </p>
        </header>

        {missingSql && (
          <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Falta aplicar la actualización de la base de datos de cierre mensual (20260969).
          </div>
        )}
        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {suggestedPeriod && !alreadyClosedSuggested && (
          <button
            type="button"
            onClick={() => closeMonth(suggestedPeriod)}
            disabled={closing}
            className="mt-6 h-12 w-full bg-[#ff2a1a] text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d] disabled:opacity-40 sm:w-auto sm:px-8"
          >
            {closing ? "Cerrando…" : `Cerrar ${periodLabel(suggestedPeriod)}`}
          </button>
        )}

        <div className="mt-8 space-y-3">
          {closures === null && <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Cargando…</div>}

          {closures !== null && closures.length === 0 && (
            <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Todavía no cerraste ningún mes.</div>
          )}

          {closures?.map((closure) => (
            <div key={closure.id} className="border border-white/[0.08] bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-black capitalize">{periodLabel(closure.period)}</p>
                <button type="button" onClick={() => reopen(closure)} className="h-8 border border-white/15 px-3 text-[9px] font-black uppercase tracking-wide text-white/50 hover:border-white/40 hover:text-white">
                  Reabrir
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                <span className="text-white/50">Presupuestado <b className="text-white">{formatMoney(closure.presupuestado)}</b></span>
                <span className="text-white/50">Facturado <b className="text-sky-300">{formatMoney(closure.facturado)}</b></span>
                <span className="text-white/50">Cobrado <b className="text-emerald-300">{formatMoney(closure.cobrado)}</b></span>
                <span className="text-white/50">Pendiente <b className="text-amber-300">{formatMoney(closure.pendiente)}</b></span>
                <span className="text-white/50">Gastos <b className="text-red-300">{formatMoney(closure.gastos)}</b></span>
                <span className="text-white/50">Resultado <b className={closure.resultado >= 0 ? "text-emerald-300" : "text-red-300"}>{formatMoney(closure.resultado)}</b></span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
