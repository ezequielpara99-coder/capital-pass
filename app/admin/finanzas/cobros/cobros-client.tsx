"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney, quoteCode } from "../../../../lib/quotes/totals";

type Pending = {
  id: string;
  number: number;
  kind: "diseno" | "rental" | "otro";
  clientName: string;
  total: number;
  cobrado: number;
  pendiente: number;
  updatedAt: string;
};

function daysSince(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24)));
}

export default function CobrosClient() {
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [error, setError] = useState("");
  const [missingSql, setMissingSql] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/admin/finanzas/cobros");
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 503) setMissingSql(true);
          throw new Error(result.error ?? "No se pudo cargar.");
        }
        setPending(result.pending);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar.");
      }
    })();
  }, []);

  const total = (pending ?? []).reduce((sum, row) => sum + row.pendiente, 0);

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href="/admin/finanzas" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Finanzas
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass admin</p>
          <h1 className="mt-3 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Centro de cobros.</h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">
            Presupuestos facturados que todavía tienen saldo pendiente, ordenados por los más viejos primero.
          </p>
        </header>

        {missingSql && (
          <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Falta aplicar la actualización de la base de datos de finanzas (20260966).
          </div>
        )}
        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {pending && pending.length > 0 && (
          <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-300/70">Total pendiente de cobro</p>
            <p className="mt-1 text-xl font-black text-amber-300">{formatMoney(total)}</p>
          </div>
        )}

        <div className="mt-6 space-y-2">
          {pending === null && <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Cargando…</div>}

          {pending !== null && pending.length === 0 && (
            <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">
              No hay nada pendiente de cobro. ✓
            </div>
          )}

          {pending?.map((row) => {
            const days = daysSince(row.updatedAt);
            return (
              <Link
                key={row.id}
                href={`/admin/presupuestos/${row.id}`}
                className="flex items-center gap-3 border border-white/[0.08] bg-white/[0.02] px-4 py-3 transition hover:border-white/20"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{row.clientName} <span className="text-white/30">· {quoteCode(row.number)}</span></p>
                  <p className="truncate text-[11px] text-white/35">
                    Facturado {formatMoney(row.total)} · Cobrado {formatMoney(row.cobrado)}
                    {days > 0 && <span className={days > 15 ? " text-red-300" : ""}> · hace {days} {days === 1 ? "día" : "días"}</span>}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-black text-amber-300">{formatMoney(row.pendiente)}</p>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
