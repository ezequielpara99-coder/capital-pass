"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  computeTotals,
  DiscountType,
  formatMoney,
  KIND_LABEL,
  Modality,
  MODALITY_LABEL,
  PriceMode,
  QuoteItem,
  QuoteKind,
  quoteCode,
  QuoteStatus,
  QUOTE_STATUSES,
  STATUS_LABEL,
} from "../../../lib/quotes/totals";

export type QuoteRow = {
  id: string;
  number: number;
  kind: QuoteKind;
  status: QuoteStatus;
  client_name: string;
  event_name: string | null;
  modality: Modality | null;
  items: QuoteItem[];
  price_mode: PriceMode;
  package_price_minor: number;
  discount_type: DiscountType;
  discount_value: number;
  created_at: string;
};

const STATUS_STYLE: Record<QuoteStatus, string> = {
  borrador: "border-white/15 bg-white/[0.03] text-white/50",
  revision: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  a_pagar: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  aceptado: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  rechazado: "border-red-400/30 bg-red-400/10 text-red-300",
};

const KIND_STYLE: Record<QuoteKind, string> = {
  diseno: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  rental: "border-orange-400/30 bg-orange-400/10 text-orange-300",
  otro: "border-white/15 bg-white/[0.03] text-white/50",
};

function totalOf(quote: QuoteRow) {
  return computeTotals(
    quote.items ?? [],
    quote.discount_type,
    Number(quote.discount_value),
    quote.price_mode === "package" ? Number(quote.package_price_minor) : null
  ).total;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));
}

export default function PresupuestosClient({ quotes, missingSql }: { quotes: QuoteRow[]; missingSql: boolean }) {
  const [rows, setRows] = useState(quotes);
  const [kind, setKind] = useState<"all" | QuoteKind>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (kind === "all" || row.kind === kind) &&
        (!term || `${row.client_name} ${row.event_name ?? ""} ${quoteCode(row.number)}`.toLowerCase().includes(term))
    );
  }, [rows, kind, search]);

  const accepted = useMemo(
    () => rows.filter((row) => row.status === "aceptado").reduce((sum, row) => sum + totalOf(row), 0),
    [rows]
  );

  async function setStatus(id: string, status: QuoteStatus) {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch(`/api/admin/presupuestos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar.");
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(row: QuoteRow) {
    if (!window.confirm(`¿Borrar el presupuesto ${quoteCode(row.number)} de ${row.client_name}?`)) return;
    setBusyId(row.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/presupuestos/${row.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo borrar.");
      setRows((prev) => prev.filter((item) => item.id !== row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[1200px] px-5 py-8 md:px-8 xl:px-10">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href="/admin" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Admin
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass admin</p>
          <h1 className="mt-3 text-[clamp(36px,5vw,64px)] font-black uppercase leading-[0.9] tracking-[-0.05em]">Presupuestos.</h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">Cotizaciones de diseño y de alquiler de terminales, listas para mandar en PDF.</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Link href="/admin/presupuestos/nuevo?tipo=diseno" className="flex h-12 items-center justify-center bg-violet-600 px-5 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-violet-500">
              + Presupuesto de diseño
            </Link>
            <Link href="/admin/presupuestos/nuevo?tipo=rental" className="flex h-12 items-center justify-center bg-[#ff2a1a] px-5 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d]">
              + Presupuesto de rentals
            </Link>
            <Link href="/admin/presupuestos/paquetes" className="flex h-12 items-center justify-center border border-white/[0.12] px-5 text-[10px] font-black uppercase tracking-[0.16em] text-white/60 transition hover:text-white">
              Paquetes
            </Link>
            <Link href="/admin/presupuestos/clientes" className="flex h-12 items-center justify-center border border-white/[0.12] px-5 text-[10px] font-black uppercase tracking-[0.16em] text-white/60 transition hover:text-white">
              Clientes
            </Link>
            <Link href="/admin/presupuestos/catalogo" className="flex h-12 items-center justify-center border border-white/[0.12] px-5 text-[10px] font-black uppercase tracking-[0.16em] text-white/60 transition hover:text-white">
              Catálogo de items
            </Link>
            <div className="flex h-12 items-center justify-between border border-emerald-400/20 bg-emerald-400/[0.05] px-4">
              <span className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-300/80">Aceptado</span>
              <span className="text-sm font-black text-emerald-300">{formatMoney(accepted)}</span>
            </div>
          </div>
        </header>

        {missingSql && (
          <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Falta aplicar la actualización de la base de datos de presupuestos (20260938). Hasta entonces no se pueden guardar.
          </div>
        )}
        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, fiesta o número"
            className="h-11 min-w-[220px] flex-1 border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#ff5a2a]/50"
          />
          <div className="flex gap-2">
            {(["all", "diseno", "rental"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setKind(value)}
                className={`h-11 border px-4 text-[10px] font-black uppercase tracking-[0.12em] transition ${
                  kind === value ? "border-white/40 bg-white/10 text-white" : "border-white/[0.12] text-white/45 hover:text-white"
                }`}
              >
                {value === "all" ? "Todos" : KIND_LABEL[value]}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="mt-6 border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">
            {rows.length === 0 ? "Todavía no hay presupuestos. Creá el primero con los botones de arriba." : "Ningún presupuesto coincide con la búsqueda."}
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {visible.map((row) => (
              <div key={row.id} className="border border-white/[0.08] bg-white/[0.02] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black tracking-wide text-white/40">{quoteCode(row.number)}</span>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${KIND_STYLE[row.kind]}`}>{KIND_LABEL[row.kind]}</span>
                      {row.modality && <span className="text-[10px] font-bold uppercase tracking-wide text-white/35">{MODALITY_LABEL[row.modality]}</span>}
                    </p>
                    <p className="mt-1 truncate text-lg font-black">{row.client_name}</p>
                    {row.event_name && <p className="truncate text-xs text-white/45">{row.event_name}</p>}
                    <p className="mt-1 text-[10px] text-white/25">{formatDate(row.created_at)}</p>
                  </div>

                  <div className="text-right">
                    <p className="text-xl font-black">{formatMoney(totalOf(row))}</p>
                    <select
                      value={row.status}
                      disabled={busyId === row.id}
                      onChange={(e) => setStatus(row.id, e.target.value as QuoteStatus)}
                      className={`mt-2 h-9 rounded-full border px-3 text-[10px] font-black uppercase tracking-wide outline-none ${STATUS_STYLE[row.status]} bg-transparent`}
                    >
                      {QUOTE_STATUSES.map((status) => (
                        <option key={status} value={status} className="bg-[#0a0908] text-white">
                          {STATUS_LABEL[status]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/admin/presupuestos/${row.id}`} className="flex h-10 items-center border border-white/15 bg-white/[0.03] px-4 text-[10px] font-black uppercase tracking-wide text-white/70 hover:border-[#ff5a2a]/40 hover:text-white">
                    Editar
                  </Link>
                  <a href={`/api/admin/presupuestos/${row.id}/pdf`} className="flex h-10 items-center bg-white px-4 text-[10px] font-black uppercase tracking-wide text-black hover:bg-white/90">
                    Descargar PDF
                  </a>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => remove(row)}
                    className="ml-auto h-10 border border-red-400/20 px-4 text-[10px] font-black uppercase tracking-wide text-red-300/70 hover:text-red-300 disabled:opacity-30"
                  >
                    Borrar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
