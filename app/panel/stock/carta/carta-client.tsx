"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type EventProduct = {
  id: string;
  sale_price_minor: number;
  product: { name: string; category: string; brand: string | null } | null;
};

type Theme = "oscuro" | "blanco";

function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

export default function CartaClient({
  eventId,
  eventName,
  organizationName,
}: {
  eventId: string;
  eventName: string;
  organizationName: string;
}) {
  const [theme, setTheme] = useState<Theme>("oscuro");
  const [drinks, setDrinks] = useState<EventProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/stock/overview?eventId=${eventId}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "No se pudo cargar la carta.");
        const eventProducts = (result.eventProducts ?? []) as EventProduct[];
        const onlyDrinks = eventProducts
          .filter((ep) => ep.product?.category === "bebida")
          .sort((a, b) => (a.product?.name ?? "").localeCompare(b.product?.name ?? ""));
        setDrinks(onlyDrinks);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la carta.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [eventId]);

  const isDark = theme === "oscuro";

  return (
    <main className={isDark ? "min-h-screen bg-black text-white" : "min-h-screen bg-white text-black"}>
      <div className="mx-auto max-w-3xl px-5 py-8 print:px-0 print:py-0">
        <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
          <Link href={`/panel/stock?eventId=${eventId}`} className={isDark ? "text-xs text-white/40 hover:text-white" : "text-xs text-black/40 hover:text-black"}>
            ← Volver a Stock
          </Link>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTheme("oscuro")}
              className={`h-10 rounded-lg px-4 text-xs font-bold uppercase tracking-wide ${
                theme === "oscuro" ? "bg-emerald-500 text-black" : isDark ? "border border-white/20 text-white/50" : "border border-black/20 text-black/50"
              }`}
            >
              Con diseño
            </button>
            <button
              type="button"
              onClick={() => setTheme("blanco")}
              className={`h-10 rounded-lg px-4 text-xs font-bold uppercase tracking-wide ${
                theme === "blanco" ? "bg-emerald-500 text-black" : isDark ? "border border-white/20 text-white/50" : "border border-black/20 text-black/50"
              }`}
            >
              Fondo blanco
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="h-10 rounded-lg bg-white/10 px-4 text-xs font-bold uppercase tracking-wide"
            >
              🖨️ Imprimir / PDF
            </button>
          </div>
        </div>

        {error && <p className="mt-6 text-sm text-red-400 print:hidden">{error}</p>}
        {loading && <p className="mt-6 text-sm opacity-40 print:hidden">Cargando...</p>}

        <div id="carta" className="mt-8 print:mt-0">
          <header className="text-center">
            <p className={`text-[10px] font-black uppercase tracking-[0.3em] ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
              {organizationName}
            </p>
            <h1 className="mt-2 text-4xl font-black uppercase tracking-[-0.02em]">Carta de tragos</h1>
            <p className={`mt-1 text-sm ${isDark ? "text-white/40" : "text-black/50"}`}>{eventName}</p>
            <div className={`mx-auto mt-5 h-px w-24 ${isDark ? "bg-white/15" : "bg-black/20"}`} />
          </header>

          {!loading && drinks.length === 0 && !error && (
            <p className={`mt-10 text-center text-sm ${isDark ? "text-white/35" : "text-black/40"}`}>
              Todavía no cargaste bebidas en el stock de este evento.
            </p>
          )}

          <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2">
            {drinks.map((ep) => (
              <div key={ep.id} className={`flex items-baseline justify-between gap-3 border-b border-dashed pb-2 ${isDark ? "border-white/15" : "border-black/20"}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{ep.product?.name}</p>
                  {ep.product?.brand && <p className={`text-[10px] uppercase tracking-wide ${isDark ? "text-white/30" : "text-black/35"}`}>{ep.product.brand}</p>}
                </div>
                <p className="shrink-0 font-mono text-sm font-bold">{money(ep.sale_price_minor)}</p>
              </div>
            ))}
          </div>

          <footer className={`mt-14 text-center text-[9px] uppercase tracking-[0.25em] ${isDark ? "text-white/20" : "text-black/30"}`}>
            Capital Pass · Event Operating System
          </footer>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body { background: ${isDark ? "#000" : "#fff"} !important; }
        }
      `}</style>
    </main>
  );
}
