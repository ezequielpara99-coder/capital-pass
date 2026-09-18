"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type BartenderRow = {
  memberId: string;
  eventStaffId: string;
  firstName: string;
  lastName: string;
  active: boolean;
  barName: string;
  salesCount: number;
  itemsSold: number;
  totalSoldMinor: number;
};

type CoverageData = {
  ok: true;
  event: { id: string; name: string } | null;
  bartenders: BartenderRow[];
  requiresUpgrade?: boolean;
  metrics: {
    totalBartenders: number;
    activeBartenders: number;
    totalBars: number;
    totalSoldMinor: number;
    comboValueMinor: number;
  };
};

export default function BarCoverageCard() {
  const [data, setData] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/stock/cobertura", {
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result?.error ?? "No se pudo cargar la cobertura de barras.");
        }

        if (mounted) {
          setData(result);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : "No se pudo cargar la cobertura de barras."
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const bartenders = useMemo(
    () =>
      [...(data?.bartenders ?? [])].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "es");
      }),
    [data]
  );

  if (loading) {
    return (
      <section className="border border-[#ff5a2a]/15 bg-[#0a0807] p-6">
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">
          Cobertura de barras
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-24 animate-pulse border border-white/[0.07] bg-white/[0.025]"
            />
          ))}
        </div>
        <div className="mt-5 h-[280px] animate-pulse border border-white/[0.07] bg-white/[0.025]" />
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="border border-red-500/20 bg-[#0a0807] p-6">
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">
          Cobertura de barras
        </p>
        <p className="mt-4 text-sm text-red-300/80">
          {error || "No se pudo cargar la cobertura."}
        </p>
        <Link
          href="/panel/stock"
          className="mt-5 inline-flex h-10 items-center justify-center bg-[#ff2a1a] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white"
        >
          Ir a Stock
        </Link>
      </section>
    );
  }

  if (data.requiresUpgrade) {
    return (
      <section className="border border-[#ff5a2a]/15 bg-[#0a0807] p-6">
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">
          Cobertura de barras
        </p>
        <h3 className="mt-2 text-2xl font-black uppercase tracking-[-0.045em] text-[#fff4ee]">
          Bartenders y ventas de barra
        </h3>
        <p className="mt-3 max-w-md text-sm leading-6 text-white/40">
          Activá el módulo de stock y barras (probalo gratis 7 días) para ver acá los bartenders
          activos y cuánto se vendió en cada barra.
        </p>
        <Link
          href="/panel/stock"
          className="mt-5 inline-flex h-10 items-center justify-center bg-[#ff2a1a] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white transition hover:bg-[#ff4a2d]"
        >
          Ir a Stock
        </Link>
      </section>
    );
  }

  return (
    <section className="overflow-hidden border border-[#ff5a2a]/15 bg-[#0a0807] shadow-[0_0_60px_rgba(255,42,26,.055)]">
      <div className="flex flex-col justify-between gap-4 border-b border-white/[0.07] px-5 py-5 md:flex-row md:items-center md:px-6">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">
            Cobertura de barras
          </p>

          <h3 className="mt-2 text-2xl font-black uppercase tracking-[-0.045em] text-[#fff4ee]">
            Bartenders y ventas de barra
          </h3>

          <p className="mt-1 text-xs text-white/32">
            {data.event ? data.event.name : "Sin evento seleccionado"}
          </p>
        </div>

        <Link
          href="/panel/stock"
          className="inline-flex h-10 items-center justify-center bg-[#ff2a1a] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white transition hover:bg-[#ff4a2d]"
        >
          Gestionar Stock
        </Link>
      </div>

      <div className="grid gap-[1px] bg-white/[0.07] sm:grid-cols-2 xl:grid-cols-4">
        <CoverageMetric
          label="Bartenders activos"
          value={String(data.metrics.activeBartenders)}
        />
        <CoverageMetric label="Barras" value={String(data.metrics.totalBars)} />
        <CoverageMetric
          label="Vendido en barra"
          value={formatMoney(data.metrics.totalSoldMinor)}
          accent
        />
        <CoverageMetric
          label="Consumido con combos"
          value={formatMoney(data.metrics.comboValueMinor)}
        />
      </div>

      <div className="p-5 md:p-6">
        {bartenders.length === 0 ? (
          <div className="border border-dashed border-white/[0.12] bg-white/[0.018] p-6 text-center">
            <p className="text-sm font-black uppercase tracking-[-0.02em] text-white/72">
              Todavía no hay bartenders asignados
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/35">
              Cuando cargues bartenders y les asignes una barra, van a aparecer en esta lista.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden border border-white/[0.07]">
            <div className="hidden grid-cols-[1.1fr_.95fr_.75fr_.65fr_.7fr] gap-4 border-b border-white/[0.07] bg-white/[0.025] px-4 py-3 text-[8px] font-black uppercase tracking-[0.18em] text-white/25 xl:grid">
              <span>Bartender</span>
              <span>Barra</span>
              <span>Estado</span>
              <span>Ítems</span>
              <span>Vendido</span>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {bartenders.map((bartender, index) => (
                <BartenderRow key={bartender.eventStaffId || bartender.memberId} bartender={bartender} index={index} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function CoverageMetric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <article
      className={`min-h-[118px] p-4 ${accent ? "bg-[#170b08]" : "bg-[#090807]"}`}
    >
      <p className="text-[8px] font-black uppercase tracking-[0.18em] text-white/25">{label}</p>
      <p
        className={`mt-5 text-2xl font-black tracking-[-0.04em] ${
          accent ? "text-[#ffc0ad]" : "text-[#fff4ee]"
        }`}
      >
        {value}
      </p>
    </article>
  );
}

function BartenderRow({ bartender, index }: { bartender: BartenderRow; index: number }) {
  const fullName = `${bartender.firstName} ${bartender.lastName}`.trim();

  return (
    <article className="grid gap-4 bg-[#080706] px-4 py-4 transition hover:bg-[#100a08] xl:grid-cols-[1.1fr_.95fr_.75fr_.65fr_.7fr] xl:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[8px] text-[#ff6040]/55">
            {String(index + 1).padStart(2, "0")}
          </span>
          <p className="truncate text-sm font-black text-white/82">
            {fullName || "Bartender"}
          </p>
        </div>
      </div>

      <DataBlock label="Barra" value={bartender.barName} />

      <div>
        <span
          className={`inline-flex border px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.14em] ${
            bartender.active
              ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200"
              : "border-white/[0.10] bg-white/[0.025] text-white/35"
          }`}
        >
          {bartender.active ? "Activo" : "Inactivo"}
        </span>
      </div>

      <div>
        <p className="text-lg font-black text-white/80">{bartender.itemsSold}</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/22">
          ítems
        </p>
      </div>

      <div>
        <p className="text-lg font-black text-[#ffc0ad]">{formatMoney(bartender.totalSoldMinor)}</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/22">
          {bartender.salesCount} ventas
        </p>
      </div>
    </article>
  );
}

function DataBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/22 xl:hidden">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-bold text-white/62 xl:mt-0">{value}</p>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}
