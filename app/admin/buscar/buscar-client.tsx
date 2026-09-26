"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Result = { type: string; label: string; sub: string | null; href: string };

const TYPE_STYLE: Record<string, string> = {
  presupuesto: "border-[#ff5a2a]/30 bg-[#ff3b24]/10 text-[#ffc0ad]",
  cliente: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  gasto: "border-red-400/30 bg-red-400/10 text-red-300",
  "pack mensual": "border-amber-400/30 bg-amber-400/10 text-amber-300",
  "catálogo": "border-white/15 bg-white/[0.03] text-white/50",
  "socio premium": "border-violet-400/30 bg-violet-400/10 text-violet-300",
  "lista negra": "border-rose-400/30 bg-rose-500/10 text-rose-300",
};

export default function BuscarClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/buscar?q=${encodeURIComponent(term)}`);
        const result = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(result.error ?? "No se pudo buscar.");
        setResults(result.results);
        setError("");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo buscar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[700px] px-5 py-8 md:px-8">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href="/admin" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Admin
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass admin</p>
          <h1 className="mt-3 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Buscar.</h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">Presupuestos, clientes, gastos, packs mensuales, catálogo, socios premium y lista negra, todo en un solo lugar.</p>
        </header>

        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, código, DNI…"
          className="mt-8 h-14 w-full border border-white/[0.12] bg-black/30 px-4 text-base text-white outline-none placeholder:text-white/25 focus:border-[#ff5a2a]/50"
        />

        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <div className="mt-6 space-y-2">
          {loading && <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Buscando…</div>}

          {!loading && results !== null && results.length === 0 && (
            <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Sin resultados.</div>
          )}

          {!loading && results?.map((row, i) => (
            <Link
              key={`${row.type}-${row.label}-${i}`}
              href={row.href}
              className="flex items-center gap-3 border border-white/[0.08] bg-white/[0.02] px-4 py-3 transition hover:border-white/25"
            >
              <span className={`shrink-0 border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${TYPE_STYLE[row.type] ?? "border-white/15 text-white/50"}`}>
                {row.type}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{row.label}</p>
                {row.sub && <p className="truncate text-[11px] text-white/35">{row.sub}</p>}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
