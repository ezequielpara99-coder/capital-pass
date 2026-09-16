"use client";

import Link from "next/link";
import { useState } from "react";

import RRPPCoverageCard from "./rrpp-coverage-card";

type EventData = {
  id: string;
  name: string;
  slug: string | null;
  startsAt: string | null;
  venueName: string | null;
  city: string | null;
  status: string;
};

type Metrics = {
  soldTickets: number;
  totalCapacity: number;
  availableTicketsNow: number;
  usedTickets: number;
  totalSales: number;
};

type TicketCardData = {
  id: string;
  name: string;
  price: number;
  sold: number;
  capacity: number;
  status: string;
};

type RecentSale = {
  id: string;
  buyer: string;
  total: number;
  channel: string;
  createdAt: string;
};

type Props = {
  section: string;
  organizerName: string;
  initials: string;
  organizationName: string;
  event: EventData | null;
  metrics: Metrics;
  ticketCards: TicketCardData[];
  recentSales: RecentSale[];
};

export default function OrganizerPanelClient({
  section,
  organizerName,
  initials,
  organizationName,
  event,
  metrics,
  ticketCards,
  recentSales,
}: Props) {
  const [mobileMenu, setMobileMenu] =
    useState(false);

  const [linkCopied, setLinkCopied] =
    useState(false);

  const eventId =
    event?.id ?? null;

  const eventHref = eventId
    ? `/panel/evento?eventId=${encodeURIComponent(
        eventId
      )}`
    : "/panel/eventos";

  const salesHref = eventId
    ? `/panel?section=ventas&eventId=${encodeURIComponent(
        eventId
      )}`
    : "/panel?section=ventas";

  const publicHref =
    event?.slug
      ? `/e/${event.slug}`
      : null;

  const status =
    eventStatus(event?.status);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#050505] text-[#f7f3ed]">

      {/* =====================================================
          AMBIENT - MISMO LENGUAJE DE LANDING / SUSCRIPCIÓN
      ===================================================== */}

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-[260px] -top-[260px] h-[650px] w-[650px] rounded-full bg-[#ff2a1a]/[0.11] blur-[180px]" />

        <div className="absolute -right-[300px] top-[17%] h-[720px] w-[720px] rounded-full bg-[#ff5a2a]/[0.085] blur-[195px]" />

        <div className="absolute bottom-[-350px] left-[25%] h-[650px] w-[800px] rounded-[50%] bg-[radial-gradient(ellipse_at_top,rgba(255,124,76,.20)_0%,rgba(255,59,36,.10)_25%,rgba(76,14,7,.06)_50%,transparent_72%)] blur-[35px]" />

        <div className="absolute inset-0 opacity-[0.033]">
          <div className="h-full w-full bg-[radial-gradient(circle,white_0.6px,transparent_0.8px)] bg-[size:5px_5px]" />
        </div>
      </div>

      <div className="relative z-10 flex min-h-screen">

        {/* ===================================================
            SIDEBAR DESKTOP
        =================================================== */}

        <aside className="sticky top-0 hidden h-screen w-[270px] shrink-0 border-r border-white/[0.07] bg-[#070605]/88 backdrop-blur-2xl lg:flex lg:flex-col">
          <Sidebar
            section={section}
            eventId={eventId}
            organizationName={
              organizationName
            }
            initials={initials}
          />
        </aside>

        {/* ===================================================
            MENÚ MOBILE
        =================================================== */}

        {mobileMenu && (
          <div className="fixed inset-0 z-[300] lg:hidden">
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={() =>
                setMobileMenu(false)
              }
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />

            <aside className="relative h-full w-[290px] border-r border-white/[0.08] bg-[#070605]">
              <div className="flex h-[72px] items-center justify-end border-b border-white/[0.07] px-5">
                <button
                  type="button"
                  onClick={() =>
                    setMobileMenu(false)
                  }
                  className="flex h-10 w-10 items-center justify-center border border-white/[0.09] text-xl text-white/50"
                >
                  ×
                </button>
              </div>

              <Sidebar
                section={section}
                eventId={eventId}
                organizationName={
                  organizationName
                }
                initials={initials}
                onNavigate={() =>
                  setMobileMenu(false)
                }
              />
            </aside>
          </div>
        )}

        {/* ===================================================
            CONTENIDO
        =================================================== */}

        <section className="min-w-0 flex-1">

          {/* =================================================
              HEADER
          ================================================= */}

          <header className="sticky top-0 z-[100] border-b border-white/[0.07] bg-[#050505]/84 backdrop-blur-2xl">
            <div className="flex h-[80px] items-center justify-between gap-4 px-5 md:px-8 xl:px-10">

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() =>
                    setMobileMenu(true)
                  }
                  className="flex h-10 w-10 items-center justify-center border border-white/[0.09] lg:hidden"
                >
                  <span className="flex flex-col gap-[5px]">
                    <span className="h-px w-4 bg-white/60" />
                    <span className="h-px w-4 bg-white/60" />
                    <span className="h-px w-4 bg-white/60" />
                  </span>
                </button>

                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.24em] text-[#ff7354]">
                    Organizer workspace
                  </p>

                  <p className="mt-1 text-sm font-bold text-white/75">
                    {organizerName}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">

                {publicHref && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard
                          .writeText(
                            `${window.location.origin}${publicHref}`
                          )
                          .then(() => {
                            setLinkCopied(true);
                            setTimeout(
                              () => setLinkCopied(false),
                              2000
                            );
                          });
                      }}
                      className="hidden h-10 items-center border border-white/[0.09] bg-white/[0.02] px-4 text-[9px] font-bold uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white md:flex"
                    >
                      {linkCopied ? "¡Copiado!" : "Copiar link público"}
                    </button>
                    <Link
                      href={publicHref}
                      target="_blank"
                      className="hidden h-10 items-center border border-white/[0.09] bg-white/[0.02] px-4 text-[9px] font-bold uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white md:flex"
                    >
                      Ver evento
                    </Link>
                  </>
                )}

                <Link
                  href="/panel/eventos/nuevo"
                  className="cp-punch hidden h-10 items-center bg-[#ff2a1a] px-5 text-[9px] font-black uppercase tracking-[0.15em] text-white shadow-[0_10px_30px_rgba(255,42,26,.3)] transition hover:scale-[1.03] hover:bg-[#ff4a2d] sm:flex"
                >
                  + Crear evento
                </Link>

                <div className="flex h-10 w-10 items-center justify-center border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.06] text-[10px] font-black">
                  {initials}
                </div>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1560px] px-5 py-8 md:px-8 xl:px-10">

            {/* =================================================
                INTRO
            ================================================= */}

            <section className="grid gap-8 border-b border-white/[0.07] pb-9 lg:grid-cols-[1fr_auto] lg:items-end">

              <div>
                <div className="inline-flex items-center gap-3 border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.055] px-4 py-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ff3b24] shadow-[0_0_12px_#ff3b24]" />

                  <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#ff9272]">
                    Capital Pass control
                  </span>
                </div>

                <h1 className="mt-7 text-[clamp(48px,6vw,88px)] font-black uppercase leading-[0.84] tracking-[-0.065em]">
                  Controlá
                  <span className="block">
                    tu evento.
                  </span>

                  <span className="block bg-gradient-to-r from-[#fff2ea] via-[#ff8c69] to-[#ff2a1a] bg-clip-text text-transparent">
                    Todo conectado.
                  </span>
                </h1>
              </div>

              <p className="max-w-[430px] pb-1 text-sm leading-7 text-white/38">
                Entradas, ventas, RRPPs,
                accesos y operación en
                tiempo real desde un solo
                lugar.
              </p>
            </section>

            {/* =================================================
                EVENTO SELECCIONADO
            ================================================= */}

            <section className="relative mt-7 overflow-hidden border border-white/[0.10] bg-[#0b0908]/95 shadow-[0_30px_100px_rgba(0,0,0,.28),0_0_70px_rgba(255,59,36,.05)]">

              <div className="pointer-events-none absolute right-[-140px] top-[-160px] h-[390px] w-[390px] rounded-full bg-[#ff3b24]/[0.11] blur-[120px]" />

              <div className="pointer-events-none absolute inset-x-[10%] top-0 h-px bg-gradient-to-r from-transparent via-[#ff704e]/40 to-transparent" />

              <div className="relative grid gap-8 p-6 md:p-8 xl:grid-cols-[1fr_auto] xl:items-end xl:p-10">

                <div>
                  <div className="inline-flex items-center gap-3 border border-white/[0.09] bg-black/30 px-3 py-2">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
                    />

                    <span
                      className={`text-[9px] font-black uppercase tracking-[0.15em] ${status.text}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  <p className="mt-8 text-[9px] font-bold uppercase tracking-[0.22em] text-[#ff7958]">
                    Evento seleccionado
                  </p>

                  <h2 className="mt-3 max-w-[950px] text-[clamp(38px,5vw,68px)] font-black uppercase leading-[0.88] tracking-[-0.055em]">
                    {event?.name ??
                      "Sin eventos"}
                  </h2>

                  {event && (
                    <div className="mt-7 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/[0.07] pt-5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">

                      <span>
                        {formatEventDate(
                          event.startsAt
                        )}
                      </span>

                      {event.city && (
                        <span>
                          {event.city}
                        </span>
                      )}

                      {event.venueName && (
                        <span>
                          {event.venueName}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-[390px]">

                  <Link
                    href={salesHref}
                    className="group flex h-12 items-center justify-between border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:bg-[#ff3b24]/[0.04] hover:text-white"
                  >
                    Ver ventas

                    <span className="text-[#ff6b4b] transition group-hover:translate-x-1">
                      →
                    </span>
                  </Link>

                  <Link
                    href={eventHref}
                    className="cp-punch group flex h-12 items-center justify-between bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white shadow-[0_14px_40px_rgba(255,59,36,.28)] transition hover:scale-[1.02] hover:brightness-110"
                  >
                    Gestionar

                    <span className="transition group-hover:translate-x-1">
                      →
                    </span>
                  </Link>
                </div>
              </div>
            </section>

            {/* =================================================
                MÉTRICAS
            ================================================= */}

            <section className="mt-5 grid gap-[1px] overflow-hidden border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 xl:grid-cols-4">

              <Metric
                number="01"
                label="Entradas vendidas"
                value={String(
                  metrics.soldTickets
                )}
                detail={`de ${metrics.totalCapacity}`}
                accent
              />

              <Metric
                number="02"
                label="Disponibles"
                value={String(
                  metrics.availableTicketsNow
                )}
                detail="habilitadas ahora"
              />

              <Metric
                number="03"
                label="Ingresos"
                value={String(
                  metrics.usedTickets
                )}
                detail={
                  metrics.soldTickets > 0
                    ? `${Math.round(
                        (metrics.usedTickets /
                          metrics.soldTickets) *
                          100
                      )}% de vendidos`
                    : "sin ingresos"
                }
              />

              <Metric
                number="04"
                label="Total vendido"
                value={formatMoney(
                  metrics.totalSales
                )}
                detail="ventas confirmadas"
              />
            </section>


            {/* =================================================
                MAPA RRPP
            ================================================= */}

            <section className="mt-5">
              <RRPPCoverageCard />
            </section>

            {/* =================================================
                TANDAS + VENTAS
            ================================================= */}

            <section className="mt-5 grid gap-5 xl:grid-cols-[0.84fr_1.16fr]">

              {/* TANDAS */}

              <div className="border border-white/[0.08] bg-[#090807]/92">

                <SectionHeader
                  eyebrow="Inventory"
                  title="Tandas"
                  href={eventHref}
                  linkLabel="Administrar"
                />

                <div className="p-5">
                  {ticketCards.length ===
                  0 ? (
                    <Empty
                      title="Sin tandas"
                      text="Todavía no configuraste entradas para este evento."
                    />
                  ) : (
                    <div className="space-y-[1px] bg-white/[0.07]">
                      {ticketCards.map(
                        (
                          ticket,
                          index
                        ) => (
                          <TicketRow
                            key={
                              ticket.id
                            }
                            ticket={
                              ticket
                            }
                            index={
                              index + 1
                            }
                          />
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* VENTAS */}

              <div className="border border-white/[0.08] bg-[#090807]/92">

                <SectionHeader
                  eyebrow="Live activity"
                  title="Ventas recientes"
                  href={salesHref}
                  linkLabel="Ver todas"
                />

                {recentSales.length ===
                0 ? (
                  <div className="p-5">
                    <Empty
                      title="Sin movimientos"
                      text="Las ventas confirmadas aparecerán acá."
                    />
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {recentSales.map(
                      (sale) => (
                        <SaleRow
                          key={sale.id}
                          sale={sale}
                        />
                      )
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* =================================================
                ACCESOS RÁPIDOS
            ================================================= */}

            <section className="mt-5 border border-white/[0.08] bg-[#080706]/85 p-5 md:p-6">

              <div className="mb-6">
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7958]">
                  Operations
                </p>

                <h3 className="mt-2 text-2xl font-black uppercase tracking-[-0.04em]">
                  Accesos rápidos
                </h3>
              </div>

              <div className="grid gap-[1px] bg-white/[0.08] sm:grid-cols-2 xl:grid-cols-5">

                <QuickLink
                  number="01"
                  label="RRPPs"
                  href={withEvent(
                    "/panel/rrpps",
                    eventId
                  )}
                />

                <QuickLink
                  number="02"
                  label="Venta en puerta"
                  href={withEvent(
                    "/panel/puerta",
                    eventId
                  )}
                />

                <QuickLink
                  number="03"
                  label="Ingresos"
                  href={withEvent(
                    "/panel?section=ingresos",
                    eventId
                  )}
                />

                <QuickLink
                  number="04"
                  label="Informes"
                  href={withEvent(
                    "/panel/informes",
                    eventId
                  )}
                />

                <QuickLink
                  number="05"
                  label="Imprimir carta de tragos"
                  href={withEvent(
                    "/panel/stock/carta",
                    eventId
                  )}
                />
              </div>
            </section>

            <footer className="mt-12 flex flex-col gap-3 border-t border-white/[0.07] py-6 text-[8px] font-bold uppercase tracking-[0.2em] text-white/18 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Capital Pass · Event Operating System
              </span>

              <span>
                Organizer Workspace
              </span>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   SIDEBAR
========================================================= */

function Sidebar({
  section,
  eventId,
  organizationName,
  initials,
  onNavigate,
}: {
  section: string;
  eventId: string | null;
  organizationName: string;
  initials: string;
  onNavigate?: () => void;
}) {
  const items = [
    {
      label: "Inicio",
      href: withEvent(
        "/panel",
        eventId
      ),
      active:
        section === "inicio",
    },
    {
      label: "Mis eventos",
      href: "/panel/eventos",
      active: false,
    },
    {
      label: "RRPPs",
      href: withEvent(
        "/panel/rrpps",
        eventId
      ),
      active: false,
    },
    {
      label: "Ventas",
      href: withEvent(
        "/panel?section=ventas",
        eventId
      ),
      active:
        section === "ventas",
    },
    {
      label: "Venta en puerta",
      href: withEvent(
        "/panel/puerta",
        eventId
      ),
      active: false,
    },
    {
      label: "Ingresos",
      href: withEvent(
        "/panel?section=ingresos",
        eventId
      ),
      active:
        section === "ingresos",
    },
    {
      label: "Notificaciones",
      href: withEvent(
        "/panel/notificaciones",
        eventId
      ),
      active: false,
    },
    {
      label: "Informes",
      href: withEvent(
        "/panel/informes",
        eventId
      ),
      active: false,
    },
    {
      label: "Cobros",
      href: "/panel/cobros",
      active: false,
    },
  ];

  return (
    <>
      {/* BRAND */}

      <div className="border-b border-white/[0.07] px-5 py-6">

        <Link
          href={withEvent(
            "/panel",
            eventId
          )}
          onClick={onNavigate}
          className="group flex items-center gap-3"
        >
          {/* MISMO SÍMBOLO DE LANDING */}

          <div className="relative h-10 w-10 shrink-0 overflow-hidden">

            <div className="absolute inset-[5px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_24px_rgba(255,59,36,.25)]" />

            <div className="absolute inset-[7px] rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.6),transparent_35%)]" />
          </div>

          <div>
            <p className="text-[12px] font-black tracking-[0.1em]">
              CAPITAL
              <span className="text-[#ff3b24]">
                PASS
              </span>
            </p>

            <p className="mt-0.5 text-[8px] uppercase tracking-[0.22em] text-white/25">
              Event Operating System
            </p>
          </div>
        </Link>
      </div>

      {/* NAV */}

      <nav className="flex-1 px-3 py-6">

        <p className="mb-4 px-3 text-[8px] font-bold uppercase tracking-[0.22em] text-white/18">
          Workspace
        </p>

        <div>
          {items.map(
            (item, index) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={onNavigate}
                className={`group flex min-h-[48px] items-center gap-3 border-b border-white/[0.055] px-3 transition ${
                  item.active
                    ? "bg-[#ff3b24]/[0.055] text-white"
                    : "text-white/33 hover:bg-white/[0.018] hover:text-white/70"
                }`}
              >
                <span
                  className={`w-5 font-mono text-[8px] ${
                    item.active
                      ? "text-[#ff6040]"
                      : "text-white/15"
                  }`}
                >
                  {String(
                    index + 1
                  ).padStart(
                    2,
                    "0"
                  )}
                </span>

                <span className="flex-1 text-[10px] font-black uppercase tracking-[0.10em]">
                  {item.label}
                </span>

                {item.active && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ff3b24] shadow-[0_0_12px_#ff3b24]" />
                )}
              </Link>
            )
          )}
        </div>

        <Link
          href="/panel/stock"
          onClick={onNavigate}
          className="group mt-4 flex min-h-[48px] items-center gap-3 border border-emerald-400/25 bg-emerald-500/[0.06] px-3 text-emerald-300 transition hover:bg-emerald-500/[0.12]"
        >
          <span className="w-5 text-[13px]">🍸</span>
          <span className="flex-1 text-[10px] font-black uppercase tracking-[0.10em]">
            Stock
          </span>
        </Link>
      </nav>

      {/* ORGANIZACIÓN */}

      <div className="border-t border-white/[0.07] p-4">
        <div className="border border-white/[0.07] bg-white/[0.018] p-4">

          <div className="flex items-center gap-3">

            <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.055] text-[9px] font-black">
              {initials}
            </div>

            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-white/65">
                {organizationName}
              </p>

              <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.16em] text-white/20">
                Organizador
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* =========================================================
   MÉTRICA
========================================================= */

function Metric({
  number,
  label,
  value,
  detail,
  accent = false,
}: {
  number: string;
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <article
      className={`relative min-h-[170px] overflow-hidden p-5 md:p-6 ${
        accent
          ? "bg-[#100806]"
          : "bg-[#090807]"
      }`}
    >
      {accent && (
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-[#ff2a1a]/[0.11] blur-[70px]" />
      )}

      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="text-[8px] font-black uppercase tracking-[0.18em] text-white/27">
            {label}
          </p>

          <span className="font-mono text-[8px] text-[#ff6040]/45">
            {number}
          </span>
        </div>

        <p className="mt-8 text-[34px] font-black tracking-[-0.055em] text-[#fff4ee] md:text-[40px]">
          {value}
        </p>

        <p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-white/22">
          {detail}
        </p>
      </div>
    </article>
  );
}

/* =========================================================
   SECTION HEADER
========================================================= */

function SectionHeader({
  eyebrow,
  title,
  href,
  linkLabel,
}: {
  eyebrow: string;
  title: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-white/[0.07] px-5 py-5 md:px-6">

      <div>
        <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#ff7958]">
          {eyebrow}
        </p>

        <h3 className="mt-2 text-xl font-black uppercase tracking-[-0.035em]">
          {title}
        </h3>
      </div>

      <Link
        href={href}
        className="pt-1 text-[8px] font-black uppercase tracking-[0.14em] text-white/25 transition hover:text-[#ff6d4c]"
      >
        {linkLabel} →
      </Link>
    </div>
  );
}

/* =========================================================
   TICKET
========================================================= */

function TicketRow({
  ticket,
  index,
}: {
  ticket: TicketCardData;
  index: number;
}) {
  const state =
    ticketStatus(
      ticket.status
    );

  const percentage =
    ticket.capacity > 0
      ? Math.min(
          100,
          Math.round(
            (ticket.sold /
              ticket.capacity) *
              100
          )
        )
      : 0;

  return (
    <div className="bg-[#0a0908] p-4 transition hover:bg-[#0e0a08]">

      <div className="flex items-start justify-between gap-5">

        <div>
          <div className="flex items-center gap-3">

            <span className="font-mono text-[8px] text-[#ff6040]/45">
              {String(index).padStart(
                2,
                "0"
              )}
            </span>

            <p className="text-xs font-black uppercase tracking-[0.01em] text-white/68">
              {ticket.name}
            </p>
          </div>

          <p className="mt-2 pl-7 text-xs text-white/28">
            {formatMoney(
              ticket.price
            )}
          </p>
        </div>

        <span
          className={`border px-2 py-1 text-[7px] font-black uppercase tracking-[0.12em] ${state.className}`}
        >
          {state.label}
        </span>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex justify-between text-[8px] font-bold uppercase tracking-[0.1em] text-white/20">
          <span>
            {ticket.sold} vendidas
          </span>

          <span>
            {ticket.capacity}
          </span>
        </div>

        <div className="h-px bg-white/[0.08]">
          <div
            className="h-full bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a]"
            style={{
              width: `${percentage}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   SALE
========================================================= */

function SaleRow({
  sale,
}: {
  sale: RecentSale;
}) {
  return (
    <div className="grid gap-4 px-5 py-5 transition hover:bg-white/[0.015] sm:grid-cols-[1fr_auto] sm:items-center md:px-6">

      <div>
        <p className="text-sm font-bold text-white/68">
          {sale.buyer}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">

          <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/20">
            {formatRelative(
              sale.createdAt
            )}
          </span>

          <span className="h-1 w-1 rounded-full bg-white/15" />

          <span className="text-[8px] font-black uppercase tracking-[0.1em] text-[#ff7655]/70">
            {formatChannel(
              sale.channel
            )}
          </span>
        </div>
      </div>

      <p className="text-lg font-black tracking-[-0.035em] text-[#fff2ea]">
        {formatMoney(
          sale.total
        )}
      </p>
    </div>
  );
}

/* =========================================================
   QUICK LINK
========================================================= */

function QuickLink({
  number,
  label,
  href,
}: {
  number: string;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-[72px] items-center justify-between bg-[#090807] px-4 transition hover:bg-[#100806]"
    >
      <div className="flex items-center gap-4">

        <span className="font-mono text-[8px] text-[#ff6040]/45">
          {number}
        </span>

        <span className="text-[9px] font-black uppercase tracking-[0.13em] text-white/42 transition group-hover:text-white">
          {label}
        </span>
      </div>

      <span className="text-[#ff6040]/40 transition group-hover:translate-x-1 group-hover:text-[#ff6040]">
        →
      </span>
    </Link>
  );
}

/* =========================================================
   EMPTY
========================================================= */

function Empty({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="border border-dashed border-white/[0.09] px-6 py-10 text-center">

      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/35">
        {title}
      </p>

      <p className="mx-auto mt-3 max-w-xs text-xs leading-5 text-white/22">
        {text}
      </p>
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function withEvent(
  path: string,
  eventId: string | null
) {
  if (!eventId) {
    return path;
  }

  const separator =
    path.includes("?")
      ? "&"
      : "?";

  return `${path}${separator}eventId=${encodeURIComponent(
    eventId
  )}`;
}

function formatMoney(
  amount: number
) {
  return new Intl.NumberFormat(
    "es-AR",
    {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }
  ).format(amount);
}

function formatEventDate(
  date: string | null
) {
  if (!date) {
    return "Fecha sin definir";
  }

  return new Intl.DateTimeFormat(
    "es-AR",
    {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone:
        "America/Argentina/Buenos_Aires",
    }
  )
    .format(new Date(date))
    .replace(".", "")
    .toUpperCase();
}

function formatRelative(
  date: string
) {
  const diff =
    Date.now() -
    new Date(date).getTime();

  const minutes =
    Math.floor(
      diff / 60000
    );

  if (minutes < 1) {
    return "Ahora";
  }

  if (minutes < 60) {
    return `Hace ${minutes} min`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  if (hours < 24) {
    return `Hace ${hours} h`;
  }

  return `Hace ${Math.floor(
    hours / 24
  )} d`;
}

function formatChannel(
  channel: string
) {
  if (channel === "rrpp") {
    return "RRPP";
  }

  if (channel === "door") {
    return "Puerta";
  }

  if (channel === "online") {
    return "Online";
  }

  return "Organizador";
}

function ticketStatus(
  status: string
) {
  switch (status) {
    case "available":
      return {
        label: "Disponible",
        className:
          "border-emerald-400/20 bg-emerald-400/[0.045] text-emerald-300",
      };

    case "sold_out":
      return {
        label: "Agotada",
        className:
          "border-red-400/20 bg-red-400/[0.045] text-red-300",
      };

    case "paused":
      return {
        label: "Pausada",
        className:
          "border-amber-400/20 bg-amber-400/[0.045] text-amber-300",
      };

    case "upcoming":
      return {
        label:
          "Próximamente",
        className:
          "border-[#ff5a2a]/20 bg-[#ff3b24]/[0.045] text-[#ff9b82]",
      };

    default:
      return {
        label: status,
        className:
          "border-white/[0.08] bg-white/[0.025] text-white/35",
      };
  }
}

function eventStatus(
  status?: string
) {
  switch (status) {
    case "active":
      return {
        label:
          "Evento activo",
        dot:
          "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.7)]",
        text:
          "text-emerald-300",
      };

    case "upcoming":
      return {
        label: "Próximo",
        dot:
          "bg-[#ff5a2a] shadow-[0_0_12px_rgba(255,90,42,.7)]",
        text:
          "text-[#ff9b82]",
      };

    case "finished":
      return {
        label:
          "Finalizado",
        dot:
          "bg-white/35",
        text:
          "text-white/40",
      };

    case "cancelled":
      return {
        label:
          "Cancelado",
        dot:
          "bg-red-400",
        text:
          "text-red-300",
      };

    default:
      return {
        label:
          "Borrador",
        dot:
          "bg-white/30",
        text:
          "text-white/40",
      };
  }
}
