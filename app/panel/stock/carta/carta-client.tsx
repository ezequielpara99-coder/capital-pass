"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../../../lib/supabase/client";

type EventProduct = {
  id: string;
  sale_price_minor: number;
  product: { name: string; category: string; brand: string | null; image_path: string | null } | null;
};

type Theme = "diseno" | "blanco";

function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

function productImageUrl(path: string | null | undefined) {
  if (!path) return null;
  return createClient().storage.from("product-assets").getPublicUrl(path).data.publicUrl;
}

const CATEGORY_KEYWORDS: { match: string; label: string }[] = [
  { match: "vodka", label: "Vodka" },
  { match: "gin", label: "Gin" },
  { match: "whisky", label: "Whisky" },
  { match: "ron", label: "Ron" },
  { match: "tequila", label: "Tequila" },
  { match: "fernet", label: "Fernet" },
  { match: "cerveza", label: "Cerveza" },
  { match: "vino", label: "Vino" },
  { match: "espumante", label: "Espumante" },
  { match: "licor", label: "Licores" },
  { match: "energizante", label: "Energizantes" },
  { match: "aperol", label: "Aperitivos" },
  { match: "campari", label: "Aperitivos" },
  { match: "cynar", label: "Aperitivos" },
  { match: "gancia", label: "Aperitivos" },
  { match: "coca-cola", label: "Sin alcohol" },
  { match: "fanta", label: "Sin alcohol" },
  { match: "sprite", label: "Sin alcohol" },
  { match: "soda", label: "Sin alcohol" },
  { match: "agua", label: "Sin alcohol" },
  { match: "pomelo", label: "Sin alcohol" },
];

function classify(name: string) {
  const lower = name.toLowerCase();
  const hit = CATEGORY_KEYWORDS.find((k) => lower.includes(k.match));
  if (hit) return hit.label;
  const firstWord = name.trim().split(/\s+/)[0];
  return firstWord ? firstWord[0].toUpperCase() + firstWord.slice(1) : "Otras bebidas";
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
  const [theme, setTheme] = useState<Theme>("diseno");
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

  const categories = useMemo(() => {
    const groups = new Map<string, EventProduct[]>();
    for (const ep of drinks) {
      const label = classify(ep.product?.name ?? "");
      const list = groups.get(label) ?? [];
      list.push(ep);
      groups.set(label, list);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [drinks]);

  const isDesign = theme === "diseno";
  const bandColors = ["from-[#ff2a1a] to-[#ff6530]", "bg-black"];

  return (
    <main className={isDesign ? "min-h-screen bg-black text-white" : "min-h-screen bg-white text-black"}>
      <div className="mx-auto max-w-3xl px-5 py-8 print:px-0 print:py-0">
        <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
          <Link href={`/panel/stock?eventId=${eventId}`} className={isDesign ? "text-xs text-white/40 hover:text-white" : "text-xs text-black/40 hover:text-black"}>
            ← Volver a Stock
          </Link>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTheme("diseno")}
              className={`h-10 rounded-lg px-4 text-xs font-bold uppercase tracking-wide ${
                theme === "diseno" ? "bg-emerald-500 text-black" : isDesign ? "border border-white/20 text-white/50" : "border border-black/20 text-black/50"
              }`}
            >
              Con diseño
            </button>
            <button
              type="button"
              onClick={() => setTheme("blanco")}
              className={`h-10 rounded-lg px-4 text-xs font-bold uppercase tracking-wide ${
                theme === "blanco" ? "bg-emerald-500 text-black" : isDesign ? "border border-white/20 text-white/50" : "border border-black/20 text-black/50"
              }`}
            >
              Fondo blanco
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className={`h-10 rounded-lg px-4 text-xs font-bold uppercase tracking-wide ${isDesign ? "bg-white/10" : "bg-black/10"}`}
            >
              🖨️ Imprimir / PDF
            </button>
          </div>
        </div>

        {error && <p className="mt-6 text-sm text-red-400 print:hidden">{error}</p>}
        {loading && <p className={`mt-6 text-sm print:hidden ${isDesign ? "text-white/40" : "text-black/40"}`}>Cargando...</p>}

        <div id="carta" className="mt-8 print:mt-0">
          {isDesign ? (
            <header className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] px-6 py-10 text-center shadow-[0_0_40px_rgba(255,59,36,.25)]">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-black/70">{organizationName}</p>
              <h1 className="mt-2 text-5xl font-black uppercase tracking-[-0.03em] text-white">Carta de tragos</h1>
              <p className="mt-2 text-sm font-bold uppercase tracking-wide text-black/70">{eventName}</p>
            </header>
          ) : (
            <header className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-black/60">{organizationName}</p>
              <h1 className="mt-2 text-4xl font-black uppercase tracking-[-0.02em]">Carta de tragos</h1>
              <p className="mt-1 text-sm text-black/50">{eventName}</p>
              <div className="mx-auto mt-5 h-px w-24 bg-black/20" />
            </header>
          )}

          {!loading && drinks.length === 0 && !error && (
            <p className={`mt-10 text-center text-sm ${isDesign ? "text-white/35" : "text-black/40"}`}>
              Todavía no cargaste bebidas en el stock de este evento.
            </p>
          )}

          <div className="mt-8 space-y-8">
            {categories.map(([label, items], index) => (
              <section key={label} className={isDesign ? "overflow-hidden rounded-xl" : ""}>
                {isDesign ? (
                  <div className={`bg-gradient-to-r px-5 py-3 ${bandColors[index % 2] ?? "bg-black"}`}>
                    <h2 className="text-2xl font-black uppercase tracking-tight text-white">{label}</h2>
                  </div>
                ) : (
                  <h2 className="border-b-2 border-black pb-1 text-xl font-black uppercase tracking-tight">{label}</h2>
                )}

                <div className={`grid grid-cols-1 gap-x-10 gap-y-2 sm:grid-cols-2 ${isDesign ? "bg-white/[0.03] px-5 py-4" : "py-3"}`}>
                  {items.map((ep) => {
                    const imageUrl = productImageUrl(ep.product?.image_path);
                    return (
                      <div key={ep.id} className="flex items-baseline gap-2">
                        {imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageUrl} alt="" className="h-6 w-6 shrink-0 translate-y-1 rounded object-contain" />
                        )}
                        <span className="shrink-0 text-sm font-bold">{ep.product?.name}</span>
                        <span className={`translate-y-[-3px] flex-1 border-b border-dotted ${isDesign ? "border-white/30" : "border-black/40"}`} />
                        <span className="shrink-0 font-mono text-sm font-bold">{money(ep.sale_price_minor)}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <footer className={`mt-14 text-center text-[9px] uppercase tracking-[0.25em] ${isDesign ? "text-white/20" : "text-black/30"}`}>
            Capital Pass · Event Operating System
          </footer>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body { background: ${isDesign ? "#000" : "#fff"} !important; }
        }
      `}</style>
    </main>
  );
}
