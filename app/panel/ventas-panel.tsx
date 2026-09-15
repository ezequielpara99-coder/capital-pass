"use client";

import Link from "next/link";
import {
  CSSProperties,
  useEffect,
  useMemo,
  useState,
} from "react";

import SaleDetailModal from "./sale-detail-modal";

type SaleRow = {
  id: string;
  buyerName: string;
  buyerDni: string | null;
  sellerName: string;
  channel: string;
  ticketType: string;
  quantity: number;
  total: number;
  status: string;
  createdAt: string;
};

type Props = {
  event: {
    id: string;
    name: string;
  };
  organizationName: string;
  initials: string;
  metrics: {
    sales: number;
    tickets: number;
    total: number;
    rrppSales: number;
  };
  sales: SaleRow[];
};

type Theme = "dark" | "light";

export default function VentasPanel({
  event,
  organizationName,
  initials,
  metrics,
  sales,
}: Props) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("all");
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("capital-pass-theme");

    if (saved === "dark" || saved === "light") {
      setTheme(saved);
    }
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("capital-pass-theme", next);
  }

  const filteredSales = useMemo(() => {
    const query = search.trim().toLowerCase();

    return sales.filter((sale) => {
      const matchesSearch =
        !query ||
        sale.buyerName.toLowerCase().includes(query) ||
        sale.buyerDni?.toLowerCase().includes(query) ||
        sale.sellerName.toLowerCase().includes(query) ||
        sale.ticketType.toLowerCase().includes(query);

      const matchesChannel = channel === "all" || sale.channel === channel;

      return matchesSearch && matchesChannel;
    });
  }, [sales, search, channel]);

  const themeVars = (
    theme === "dark"
      ? {
          "--cp-bg": "#050505",
          "--cp-sidebar": "#070605",
          "--cp-panel": "#090807",
          "--cp-panel-2": "#0d0a08",
          "--cp-text": "#f7f3ed",
          "--cp-muted": "rgba(247,243,237,.36)",
          "--cp-border": "rgba(255,255,255,.075)",
          "--cp-hover": "rgba(255,59,36,.045)",
        }
      : {
          "--cp-bg": "#f4eee8",
          "--cp-sidebar": "#eee5dc",
          "--cp-panel": "#fffaf6",
          "--cp-panel-2": "#f7eee7",
          "--cp-text": "#20120d",
          "--cp-muted": "rgba(32,18,13,.52)",
          "--cp-border": "rgba(32,18,13,.11)",
          "--cp-hover": "rgba(255,59,36,.07)",
        }
  ) as CSSProperties;

  const eventId = event.id;

  return (
    <>
      <main
        style={themeVars}
        className="relative min-h-screen overflow-x-hidden bg-[var(--cp-bg)] text-[var(--cp-text)]"
      >
        {/* AMBIENT */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -left-[260px] -top-[280px] h-[680px] w-[680px] rounded-full bg-[#ff2a1a]/[0.10] blur-[185px]" />
          <div className="absolute -right-[300px] top-[15%] h-[720px] w-[720px] rounded-full bg-[#ff5a2a]/[0.075] blur-[195px]" />
          <div className="absolute bottom-[-360px] left-[20%] h-[700px] w-[900px] rounded-[50%] bg-[radial-gradient(ellipse_at_top,rgba(255,124,76,.18)_0%,rgba(255,59,36,.09)_25%,rgba(76,14,7,.05)_50%,transparent_72%)] blur-[40px]" />
          <div className="absolute inset-0 opacity-[0.03]">
            <div className="h-full w-full bg-[radial-gradient(circle,currentColor_0.6px,transparent_0.8px)] bg-[size:5px_5px]" />
          </div>
        </div>

        <div className="relative z-10 flex min-h-screen">
          {/* SIDEBAR */}
          <aside className="sticky top-0 hidden h-screen w-[270px] shrink-0 border-r border-[var(--cp-border)] bg-[var(--cp-sidebar)]/90 backdrop-blur-2xl lg:flex lg:flex-col">
            <Brand href={withEvent("/panel", eventId)} />

            <nav className="flex-1 px-3 py-6">
              <p className="mb-4 px-3 text-[8px] font-bold uppercase tracking-[0.22em] text-[var(--cp-muted)]">
                Workspace
              </p>

              <SidebarLink number="01" label="Inicio" href={withEvent("/panel", eventId)} />
              <SidebarLink number="02" label="Mis eventos" href="/panel/eventos" />
              <SidebarLink number="03" label="RRPPs" href={withEvent("/panel/rrpps", eventId)} />
              <SidebarLink number="04" label="Ventas" href={withEvent("/panel?section=ventas", eventId)} active />
              <SidebarLink number="05" label="Venta en puerta" href={withEvent("/panel/puerta", eventId)} />
              <SidebarLink number="06" label="Ingresos" href={withEvent("/panel?section=ingresos", eventId)} />
              <SidebarLink number="07" label="Notificaciones" href={withEvent("/panel/notificaciones", eventId)} />
              <SidebarLink number="08" label="Informes" href={withEvent("/panel/informes", eventId)} />
            </nav>

            <div className="border-t border-[var(--cp-border)] p-4">
              <div className="border border-[var(--cp-border)] bg-[var(--cp-hover)] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.055] text-[9px] font-black">
                    {initials}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-[var(--cp-text)]/70">
                      {organizationName}
                    </p>
                    <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.16em] text-[var(--cp-muted)]">
                      Organizador
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* CONTENT */}
          <section className="min-w-0 flex-1">
            <header className="sticky top-0 z-50 border-b border-[var(--cp-border)] bg-[var(--cp-bg)]/86 backdrop-blur-2xl">
              <div className="flex h-[80px] items-center justify-between gap-4 px-5 md:px-8 xl:px-10">
                <div className="flex items-center gap-4">
                  <div className="lg:hidden">
                    <Brand href={withEvent("/panel", eventId)} compact />
                  </div>

                  <div className="hidden lg:block">
                    <p className="text-[8px] font-black uppercase tracking-[0.24em] text-[#ff7354]">
                      Commercial workspace
                    </p>
                    <p className="mt-1 text-sm font-bold text-[var(--cp-text)]/68">
                      {event.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={withEvent("/panel/evento", eventId)}
                    className="hidden h-10 items-center border border-[var(--cp-border)] bg-[var(--cp-hover)] px-4 text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--cp-muted)] transition hover:border-[#ff5a2a]/30 hover:text-[var(--cp-text)] sm:flex"
                  >
                    Gestionar evento
                  </Link>

                  <button
                    type="button"
                    onClick={toggleTheme}
                    aria-label="Cambiar tema"
                    className="flex h-10 w-10 items-center justify-center border border-[var(--cp-border)] bg-[var(--cp-hover)] text-xs text-[var(--cp-muted)] transition hover:border-[#ff5a2a]/30 hover:text-[var(--cp-text)]"
                  >
                    {theme === "dark" ? "☀" : "◐"}
                  </button>

                  <div className="flex h-10 w-10 items-center justify-center border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.055] text-[10px] font-black">
                    {initials}
                  </div>
                </div>
              </div>
            </header>

            <div className="mx-auto max-w-[1560px] px-5 py-9 md:px-8 xl:px-10">
              {/* HERO */}
              <section className="grid gap-9 border-b border-[var(--cp-border)] pb-10 xl:grid-cols-[1fr_auto] xl:items-end">
                <div>
                  <div className="inline-flex items-center gap-3 border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.055] px-4 py-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#ff3b24] shadow-[0_0_12px_#ff3b24]" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#ff9272]">
                      Sales control
                    </span>
                  </div>

                  <h1 className="mt-7 text-[clamp(52px,7vw,96px)] font-black uppercase leading-[0.82] tracking-[-0.07em]">
                    Ventas
                    <span className="block bg-gradient-to-r from-[#fff2ea] via-[#ff8c69] to-[#ff2a1a] bg-clip-text text-transparent">
                      en tiempo real.
                    </span>
                  </h1>

                  <p className="mt-7 max-w-[660px] text-sm leading-7 text-[var(--cp-muted)] md:text-base">
                    Seguimiento comercial de {event.name}: operaciones confirmadas, entradas, canales y vendedores.
                  </p>
                </div>

                <div className="border border-[var(--cp-border)] bg-[var(--cp-panel)] px-5 py-4 text-right">
                  <p className="text-[8px] font-black uppercase tracking-[0.18em] text-[#ff7958]">
                    Registros visibles
                  </p>
                  <p className="mt-2 text-3xl font-black tracking-[-0.055em]">
                    {filteredSales.length}
                  </p>
                </div>
              </section>

              {/* METRICS */}
              <section className="mt-5 grid gap-[1px] overflow-hidden border border-[var(--cp-border)] bg-[var(--cp-border)] sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard number="01" title="Ventas" value={String(metrics.sales)} detail="operaciones confirmadas" />
                <MetricCard number="02" title="Entradas" value={String(metrics.tickets)} detail="tickets vendidos" />
                <MetricCard number="03" title="Total vendido" value={formatMoney(metrics.total)} detail="importe acumulado" accent />
                <MetricCard number="04" title="Ventas RRPP" value={String(metrics.rrppSales)} detail="operaciones por promotores" />
              </section>

              {/* FILTERS */}
              <section className="mt-5 border border-[var(--cp-border)] bg-[var(--cp-panel)] p-4 md:p-5">
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#ff7958]">
                      Filters
                    </p>
                    <h2 className="mt-2 text-xl font-black uppercase tracking-[-0.04em]">
                      Buscar ventas
                    </h2>
                  </div>

                  {(search || channel !== "all") && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setChannel("all");
                      }}
                      className="text-[8px] font-black uppercase tracking-[0.14em] text-[var(--cp-muted)] transition hover:text-[#ff7958]"
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-[1fr_240px]">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#ff7958]/55">
                      ⌕
                    </span>
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar comprador, DNI, RRPP o tanda..."
                      className="h-12 w-full border border-[var(--cp-border)] bg-[var(--cp-panel-2)] pl-10 pr-4 text-sm outline-none transition placeholder:text-[var(--cp-muted)] focus:border-[#ff5a2a]/45"
                    />
                  </div>

                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    className="h-12 border border-[var(--cp-border)] bg-[var(--cp-panel-2)] px-4 text-sm outline-none transition focus:border-[#ff5a2a]/45"
                  >
                    <option value="all">Todos los canales</option>
                    <option value="rrpp">RRPP</option>
                    <option value="organizer">Organizador</option>
                    <option value="door">Puerta</option>
                    <option value="online">Online</option>
                  </select>
                </div>
              </section>

              {/* HISTORY */}
              <section className="mt-5 overflow-hidden border border-[var(--cp-border)] bg-[var(--cp-panel)]">
                <div className="flex flex-col gap-4 border-b border-[var(--cp-border)] px-5 py-5 sm:flex-row sm:items-end sm:justify-between md:px-6">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#ff7958]">
                      Live activity
                    </p>
                    <h2 className="mt-2 text-xl font-black uppercase tracking-[-0.04em]">
                      Historial de ventas
                    </h2>
                    <p className="mt-2 text-xs text-[var(--cp-muted)]">
                      {filteredSales.length} resultado{filteredSales.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-[var(--cp-muted)]">
                    Seleccioná una venta para ver sus entradas
                  </p>
                </div>

                {filteredSales.length === 0 ? (
                  <div className="border-t border-dashed border-[var(--cp-border)] p-10 text-center">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--cp-muted)]">
                      Sin resultados
                    </p>
                    <p className="mx-auto mt-3 max-w-sm text-xs leading-5 text-[var(--cp-muted)]">
                      No encontramos ventas que coincidan con los filtros seleccionados.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* DESKTOP */}
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full min-w-[1050px] text-left">
                        <thead className="border-b border-[var(--cp-border)] text-[9px] font-black uppercase tracking-[0.14em] text-[var(--cp-muted)]">
                          <tr>
                            <th className="px-6 py-4 font-black">Comprador</th>
                            <th className="px-6 py-4 font-black">Venta</th>
                            <th className="px-6 py-4 font-black">Vendedor</th>
                            <th className="px-6 py-4 font-black">Cant.</th>
                            <th className="px-6 py-4 font-black">Total</th>
                            <th className="px-6 py-4 font-black">Estado</th>
                            <th className="px-6 py-4 font-black">Fecha</th>
                            <th className="px-6 py-4 text-right font-black">Acción</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-[var(--cp-border)]">
                          {filteredSales.map((sale) => (
                            <tr
                              key={sale.id}
                              className="transition hover:bg-[var(--cp-hover)]"
                            >
                              <td className="px-6 py-5">
                                <p className="text-sm font-bold text-[var(--cp-text)]/78">
                                  {sale.buyerName}
                                </p>
                                <p className="mt-1 text-xs text-[var(--cp-muted)]">
                                  {sale.buyerDni ? `DNI ${sale.buyerDni}` : "Sin DNI"}
                                </p>
                              </td>

                              <td className="px-6 py-5">
                                <p className="text-sm text-[var(--cp-text)]/72">
                                  {sale.ticketType}
                                </p>
                                <p className="mt-1 text-[9px] font-black uppercase tracking-[0.11em] text-[#ff7958]/70">
                                  {formatChannel(sale.channel)}
                                </p>
                              </td>

                              <td className="px-6 py-5 text-sm text-[var(--cp-text)]/58">
                                {sale.sellerName}
                              </td>

                              <td className="px-6 py-5 text-sm font-bold">
                                {sale.quantity}
                              </td>

                              <td className="px-6 py-5 text-sm font-black tracking-[-0.02em]">
                                {formatMoney(sale.total)}
                              </td>

                              <td className="px-6 py-5">
                                <span className="border border-emerald-400/18 bg-emerald-400/[0.055] px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.11em] text-emerald-300">
                                  {formatStatus(sale.status)}
                                </span>
                              </td>

                              <td className="px-6 py-5 text-xs text-[var(--cp-muted)]">
                                {formatDate(sale.createdAt)}
                              </td>

                              <td className="px-6 py-5 text-right">
                                <button
                                  type="button"
                                  onClick={() => setSelectedSaleId(sale.id)}
                                  className="inline-flex h-10 items-center justify-center border border-[#ff5a2a]/25 bg-[#ff3b24]/[0.055] px-4 text-[8px] font-black uppercase tracking-[0.13em] text-[#ff9b82] transition hover:border-[#ff5a2a]/45 hover:bg-[#ff3b24]/[0.10] hover:text-white"
                                >
                                  Ver detalle →
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* MOBILE */}
                    <div className="divide-y divide-[var(--cp-border)] md:hidden">
                      {filteredSales.map((sale, index) => (
                        <article key={sale.id} className="p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-[8px] text-[#ff6040]/55">
                                  {String(index + 1).padStart(2, "0")}
                                </span>
                                <p className="truncate text-sm font-black uppercase tracking-[-0.015em]">
                                  {sale.buyerName}
                                </p>
                              </div>

                              <p className="mt-2 pl-7 text-xs text-[var(--cp-muted)]">
                                {sale.ticketType} · {sale.quantity} entrada{sale.quantity !== 1 ? "s" : ""}
                              </p>

                              {sale.buyerDni && (
                                <p className="mt-1 pl-7 text-xs text-[var(--cp-muted)]">
                                  DNI {sale.buyerDni}
                                </p>
                              )}
                            </div>

                            <p className="shrink-0 text-lg font-black tracking-[-0.035em]">
                              {formatMoney(sale.total)}
                            </p>
                          </div>

                          <div className="mt-5 flex items-end justify-between gap-4 border-t border-[var(--cp-border)] pt-4">
                            <div>
                              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#ff7958]/70">
                                {formatChannel(sale.channel)} · {sale.sellerName}
                              </p>
                              <p className="mt-1 text-[9px] text-[var(--cp-muted)]">
                                {formatDate(sale.createdAt)}
                              </p>
                            </div>

                            <span className="border border-emerald-400/18 bg-emerald-400/[0.055] px-2 py-1 text-[7px] font-black uppercase tracking-[0.1em] text-emerald-300">
                              {formatStatus(sale.status)}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => setSelectedSaleId(sale.id)}
                            className="mt-4 flex h-11 w-full items-center justify-between bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] px-4 text-[8px] font-black uppercase tracking-[0.14em] text-white"
                          >
                            Ver detalle de la venta
                            <span>→</span>
                          </button>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </section>

              <footer className="mt-14 flex flex-col gap-3 border-t border-[var(--cp-border)] py-6 text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--cp-muted)] sm:flex-row sm:items-center sm:justify-between">
                <span>Capital Pass · Event Operating System</span>
                <span>Sales Workspace</span>
              </footer>
            </div>
          </section>
        </div>
      </main>

      <SaleDetailModal
        open={selectedSaleId !== null}
        saleId={selectedSaleId}
        onClose={() => setSelectedSaleId(null)}
      />
    </>
  );
}

function Brand({
  href,
  compact = false,
}: {
  href: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "border-b border-[var(--cp-border)] px-5 py-6"}>
      <Link href={href} className="flex items-center gap-3">
        <div className={`${compact ? "h-9 w-9" : "h-10 w-10"} relative shrink-0 overflow-hidden`}>
          <div className="absolute inset-[5px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_24px_rgba(255,59,36,.25)]" />
          <div className="absolute inset-[7px] rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.6),transparent_35%)]" />
        </div>

        <div className={compact ? "hidden sm:block" : ""}>
          <p className="text-[12px] font-black tracking-[0.1em]">
            CAPITAL<span className="text-[#ff3b24]">PASS</span>
          </p>
          <p className="mt-0.5 text-[8px] uppercase tracking-[0.22em] text-[var(--cp-muted)]">
            Event Operating System
          </p>
        </div>
      </Link>
    </div>
  );
}

function SidebarLink({
  number,
  label,
  href,
  active = false,
}: {
  number: string;
  label: string;
  href: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex min-h-[48px] items-center gap-3 border-b border-[var(--cp-border)] px-3 transition ${
        active
          ? "bg-[#ff3b24]/[0.055] text-[var(--cp-text)]"
          : "text-[var(--cp-muted)] hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text)]"
      }`}
    >
      <span className={`w-5 font-mono text-[8px] ${active ? "text-[#ff6040]" : "opacity-45"}`}>
        {number}
      </span>
      <span className="flex-1 text-[10px] font-black uppercase tracking-[0.10em]">
        {label}
      </span>
      {active && (
        <span className="h-1.5 w-1.5 rounded-full bg-[#ff3b24] shadow-[0_0_12px_#ff3b24]" />
      )}
    </Link>
  );
}

function MetricCard({
  number,
  title,
  value,
  detail,
  accent = false,
}: {
  number: string;
  title: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <article className={`relative min-h-[170px] overflow-hidden p-5 md:p-6 ${accent ? "bg-[#120806]" : "bg-[var(--cp-panel)]"}`}>
      {accent && (
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-[#ff2a1a]/[0.12] blur-[70px]" />
      )}

      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[8px] font-black uppercase tracking-[0.18em] text-[var(--cp-muted)]">
            {title}
          </p>
          <span className="font-mono text-[8px] text-[#ff6040]/50">
            {number}
          </span>
        </div>

        <p className={`mt-8 text-[34px] font-black tracking-[-0.055em] md:text-[40px] ${accent ? "text-[#fff2ea]" : ""}`}>
          {value}
        </p>
        <p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-[var(--cp-muted)]">
          {detail}
        </p>
      </div>
    </article>
  );
}

function withEvent(path: string, eventId: string | null) {
  if (!eventId) return path;

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}eventId=${encodeURIComponent(eventId)}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatChannel(channel: string) {
  if (channel === "rrpp") return "RRPP";
  if (channel === "door") return "Puerta";
  if (channel === "online") return "Online";
  return "Organizador";
}

function formatStatus(status: string) {
  if (status === "confirmed") return "Confirmada";
  return status;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));
}
