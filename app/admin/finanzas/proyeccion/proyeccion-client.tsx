"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "../../../../lib/quotes/totals";

type MonthRow = {
  period: string;
  recurringIncomeMinor: number;
  recurringExpenseMinor: number;
  oneTimeMinor: number;
  netMinor: number;
  cumulativeMinor: number;
};

type Data = {
  recurringIncomeMinor: number;
  recurringExpenseMinor: number;
  pendingCollectionsMinor: number;
  months: MonthRow[];
};

function periodLabel(value: string) {
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T00:00:00Z`));
}

export default function ProyeccionClient() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [missingSql, setMissingSql] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/admin/finanzas/proyeccion");
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 503) setMissingSql(true);
          throw new Error(result.error ?? "No se pudo cargar.");
        }
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar.");
      }
    })();
  }, []);

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href="/admin/finanzas" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Finanzas
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass admin</p>
          <h1 className="mt-3 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Flujo de caja.</h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">
            Proyección estimada a 6 meses, basada en tus packs mensuales activos y tus gastos recurrentes. No es un calendario día a día —
            los presupuestos no tienen fecha de vencimiento cargada, así que lo pendiente de cobro se asume que entra en el mes actual.
          </p>
        </header>

        {missingSql && (
          <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Falta aplicar alguna actualización de la base de datos de finanzas.
          </div>
        )}
        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {data && (
          <>
            <div className="mt-8 grid gap-[1px] bg-white/[0.08] sm:grid-cols-3">
              <div className="bg-[#080706]/85 p-5">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Ingreso recurrente mensual</p>
                <p className="mt-2 text-xl font-black text-emerald-300">{formatMoney(data.recurringIncomeMinor)}</p>
                <p className="mt-1 text-[11px] text-white/30">Suma de packs mensuales activos</p>
              </div>
              <div className="bg-[#080706]/85 p-5">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Gasto recurrente mensual</p>
                <p className="mt-2 text-xl font-black text-red-300">{formatMoney(data.recurringExpenseMinor)}</p>
                <p className="mt-1 text-[11px] text-white/30">Último monto de cada gasto marcado recurrente</p>
              </div>
              <div className="bg-[#080706]/85 p-5">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Pendiente de cobro</p>
                <p className="mt-2 text-xl font-black text-amber-300">{formatMoney(data.pendingCollectionsMinor)}</p>
                <p className="mt-1 text-[11px] text-white/30">Ya facturado, se suma al mes actual</p>
              </div>
            </div>

            <div className="mt-8 space-y-2">
              {data.months.map((month) => (
                <div key={month.period} className="border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold capitalize">{periodLabel(month.period)}</p>
                    <p className={`text-sm font-black ${month.netMinor >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                      {formatMoney(month.netMinor)}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] text-white/35">
                    + {formatMoney(month.recurringIncomeMinor)} recurrente
                    {month.oneTimeMinor > 0 ? ` + ${formatMoney(month.oneTimeMinor)} pendiente` : ""}
                    {" − "}
                    {formatMoney(month.recurringExpenseMinor)} gastos
                    {" · Acumulado "}
                    <span className={month.cumulativeMinor >= 0 ? "text-emerald-300/70" : "text-red-300/70"}>{formatMoney(month.cumulativeMinor)}</span>
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
