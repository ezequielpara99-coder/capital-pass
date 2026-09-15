"use client";

import Link from "next/link";

import {
  CSSProperties,
  useEffect,
  useMemo,
  useState,
} from "react";

type Report = {
  event: {
    id: string;
    name: string;
    slug: string;
    startsAt: string;
    endsAt: string | null;
    venueName: string | null;
    city: string | null;
    status: string;
  };

  metrics: {
    sales: number;

    ticketsSold: number;
    ticketsIssued: number;
    returnedTickets: number;
    cancelledTickets: number;

    totalRevenue: number;
    grossRevenue: number;
    returnAmount: number;
    refundedAmount: number;
    pendingRefundAmount: number;
    netRevenue: number;

    rrppRevenue: number;
    rrppRefunded: number;
    rrppNetRevenue: number;

    doorRevenue: number;
    doorRefunded: number;
    doorNetRevenue: number;

    organizerRevenue: number;
    organizerRefunded: number;
    organizerNetRevenue: number;

    rrppCommissionGenerated: number;
    rrppCommissionPaid: number;
    rrppCommissionPending: number;

    rrppSales: number;
    doorSales: number;
    organizerSales: number;

    usedTickets: number;
    pendingTickets: number;
    attendancePercentage: number;

    buyers: number;

    firstEntry: string | null;
    lastEntry: string | null;
  };

  ticketTypes: {
    id: string;
    name: string;
    capacity: number;
    sold: number;
    used: number;
    returned: number;
    revenue: number;
    refunded: number;
    netRevenue: number;
    status: string;
  }[];

  sellers: {
    memberId: string;
    name: string;
    role: string;
    channel: string;
    sales: number;
    tickets: number;
    returnedTickets: number;
    revenue: number;
    refunded: number;
    netRevenue: number;

    commissionPercentage: number;
    commissionBase: number;
    commissionGenerated: number;
    commissionPaid: number;
    commissionPending: number;
  }[];

  controllers: {
    memberId: string;
    name: string;
    active: boolean;
  }[];
};

type Props = {
  organizationName: string;
  organizerName: string;
  initials: string;
  reports: Report[];
};

type Theme =
  | "dark"
  | "light";

type View =
  | "calendar"
  | "history";

type CalendarCell =
  | {
      day: number;
      key: string;
    }
  | null;

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const WEEKDAYS = [
  "L",
  "M",
  "X",
  "J",
  "V",
  "S",
  "D",
];

export default function InformesClient({
  organizationName,
  organizerName,
  initials,
  reports,
}: Props) {
  const [theme, setTheme] =
    useState<Theme>("dark");

  const [view, setView] =
    useState<View>("calendar");

  const initialEvent =
    reports[0] ?? null;

  const initialDate =
    initialEvent
      ? new Date(
          initialEvent.event.startsAt
        )
      : new Date();

  const [
    calendarYear,
    setCalendarYear,
  ] = useState(
    initialDate.getFullYear()
  );

  const [
    calendarMonth,
    setCalendarMonth,
  ] = useState(
    initialDate.getMonth()
  );

  const [
    selectedEventId,
    setSelectedEventId,
  ] = useState<
    string | null
  >(
    initialEvent?.event.id ??
      null
  );

  const [search, setSearch] =
    useState("");

  // =====================================================
  // TEMA
  // =====================================================

  useEffect(() => {
    const saved =
      localStorage.getItem(
        "capital-pass-theme"
      );

    if (
      saved === "dark" ||
      saved === "light"
    ) {
      setTheme(saved);
    }
  }, []);

  function toggleTheme() {
    const next =
      theme === "dark"
        ? "light"
        : "dark";

    setTheme(next);

    localStorage.setItem(
      "capital-pass-theme",
      next
    );
  }

  const themeVars =
    (theme === "dark"
      ? {
          "--cp-bg": "#050505",
          "--cp-sidebar": "#050505",
          "--cp-panel": "#080706",
          "--cp-text": "#f7f3ed",
          "--cp-muted": "rgba(247,243,237,.45)",
          "--cp-border": "rgba(255,255,255,.09)",
          "--cp-hover": "rgba(255,255,255,.035)",
        }
      : {
          "--cp-bg": "#f7f3ed",
          "--cp-sidebar": "#f7f3ed",
          "--cp-panel": "#fffdfa",
          "--cp-text": "#211912",
          "--cp-muted": "rgba(33,25,18,.58)",
          "--cp-border": "rgba(33,25,18,.14)",
          "--cp-hover": "rgba(255,59,36,.055)",
        }) as CSSProperties &
    Record<`--${string}`, string>;

  // =====================================================
  // EVENTO SELECCIONADO
  // =====================================================

  const selectedReport =
    reports.find(
      (report) =>
        report.event.id ===
        selectedEventId
    ) ?? null;

  // =====================================================
  // EVENTOS POR FECHA
  // =====================================================

  const eventsByDate =
    useMemo(() => {
      const map =
        new Map<
          string,
          Report[]
        >();

      for (
        const report of reports
      ) {
        const key =
          getDateKey(
            report.event
              .startsAt
          );

        const current =
          map.get(key) ?? [];

        current.push(report);

        map.set(
          key,
          current
        );
      }

      return map;
    }, [reports]);

  // =====================================================
  // CALENDARIO
  // =====================================================

  const calendarDays =
    useMemo<
      CalendarCell[]
    >(() => {
      const firstDay =
        new Date(
          calendarYear,
          calendarMonth,
          1
        );

      const lastDay =
        new Date(
          calendarYear,
          calendarMonth +
            1,
          0
        );

      // JS usa domingo = 0.
      // Nosotros queremos lunes = 0.
      const mondayIndex =
        (firstDay.getDay() +
          6) %
        7;

      const cells: CalendarCell[] =
        [];

      // Espacios vacíos antes del día 1.
      for (
        let i = 0;
        i < mondayIndex;
        i++
      ) {
        cells.push(null);
      }

      // Días reales del mes.
      for (
        let day = 1;
        day <=
        lastDay.getDate();
        day++
      ) {
        cells.push({
          day,

          key: makeDateKey(
            calendarYear,
            calendarMonth,
            day
          ),
        });
      }

      return cells;
    }, [
      calendarYear,
      calendarMonth,
    ]);

  // =====================================================
  // MES ANTERIOR / SIGUIENTE
  // =====================================================

  function previousMonth() {
    if (
      calendarMonth === 0
    ) {
      setCalendarYear(
        calendarYear - 1
      );

      setCalendarMonth(11);

      return;
    }

    setCalendarMonth(
      calendarMonth - 1
    );
  }

  function nextMonth() {
    if (
      calendarMonth === 11
    ) {
      setCalendarYear(
        calendarYear + 1
      );

      setCalendarMonth(0);

      return;
    }

    setCalendarMonth(
      calendarMonth + 1
    );
  }

  // =====================================================
  // HISTORIAL FILTRADO
  // =====================================================

  const filteredReports =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      if (!query) {
        return reports;
      }

      return reports.filter(
        (report) =>
          report.event.name
            .toLowerCase()
            .includes(query) ||
          report.event.city
            ?.toLowerCase()
            .includes(query) ||
          report.event.venueName
            ?.toLowerCase()
            .includes(query)
      );
    }, [
      reports,
      search,
    ]);

  const reportsByYear =
    useMemo(() => {
      const map =
        new Map<
          number,
          Report[]
        >();

      for (
        const report of
          filteredReports
      ) {
        const year =
          new Date(
            report.event
              .startsAt
          ).getFullYear();

        const current =
          map.get(year) ??
          [];

        current.push(
          report
        );

        map.set(
          year,
          current
        );
      }

      return [
        ...map.entries(),
      ].sort(
        (a, b) =>
          b[0] - a[0]
      );
    }, [filteredReports]);

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <main
      style={themeVars}
      className="relative min-h-screen overflow-hidden bg-[var(--cp-bg)] px-5 py-6 text-[color:var(--cp-text)] selection:bg-[#ff3b24] selection:text-[var(--cp-text)] md:px-8 xl:px-10"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-[260px] -top-[280px] h-[680px] w-[680px] bg-[#ff2a1a]/[0.11] blur-[185px]" />
        <div className="absolute -right-[280px] top-[15%] h-[700px] w-[700px] bg-[#ff5a2a]/[0.08] blur-[190px]" />
        <div className="absolute bottom-[-350px] left-[25%] h-[650px] w-[820px] bg-[radial-gradient(ellipse_at_top,rgba(255,124,76,.18)_0%,rgba(255,59,36,.09)_25%,rgba(76,14,7,.06)_50%,transparent_72%)] blur-[40px]" />
        <div className="absolute inset-0 opacity-[0.033] [background-image:radial-gradient(rgba(255,255,255,.9)_0.6px,transparent_0.8px)] [background-size:5px_5px]" />
      </div>

      <div className="relative z-10 mx-auto min-h-screen w-full max-w-[1480px]">

        {/* =====================================================
            SIDEBAR
        ===================================================== */}

        <aside className="hidden">

          <div className="border-b border-[var(--cp-border)] px-6 py-6">

            <Link
              href="/panel"
              className="flex items-center gap-3"
            >
              <div className="flex h-11 w-11 items-center justify-center border border-[#ff5a2a]/30 bg-gradient-to-br from-[#ff2a1a]/50 to-[#ff5a2a]/20 font-black text-[var(--cp-text)]">
                CP
              </div>

              <div>
                <p className="font-black">
                  Capital Pass
                </p>

                <p className="text-xs text-[var(--cp-muted)]">
                  Event Management
                </p>
              </div>
            </Link>

          </div>

          <nav className="flex-1 space-y-1.5 px-3 py-5">

            <MenuItem
              label="Inicio"
              href="/panel"
            />

            <MenuItem
              label="Mis eventos"
              href="/panel/evento"
            />

            <MenuItem
              label="RRPPs"
              href="/panel/rrpps"
            />

            <MenuItem
              label="Ventas"
              href="/panel?section=ventas"
            />

            <MenuItem
              label="Venta en puerta"
              href="/panel/puerta"
            />

            <MenuItem
              label="Ingresos"
              href="/panel?section=ingresos"
            />

            <MenuItem
              label="Notificaciones"
              href="/panel/notificaciones"
            />

            <MenuItem
              label="Informes"
              href="/panel/informes"
              active
            />

          </nav>

          <div className="border-t border-[var(--cp-border)] p-4">

            <div className="border border-[var(--cp-border)] bg-[var(--cp-hover)] p-4">

              <p className="text-sm font-bold">
                {organizationName}
              </p>

              <p className="mt-1 text-xs text-[var(--cp-muted)]">
                Organizador
              </p>

            </div>

          </div>

        </aside>

        {/* =====================================================
            CONTENIDO
        ===================================================== */}

        <section className="min-w-0">

          {/* ===================================================
              HEADER
          =================================================== */}

          <header className="flex min-h-[76px] items-center justify-between border-b border-[var(--cp-border)] pb-5">

            <div>

              <div className="flex min-w-0 items-center gap-4">
                <Link
                  href="/panel"
                  className="flex h-11 w-11 shrink-0 items-center justify-center border border-[var(--cp-border)] bg-[var(--cp-hover)] text-lg text-[var(--cp-muted)] transition hover:border-[#ff3b24]/45 hover:text-[var(--cp-text)]"
                  aria-label="Volver al panel"
                >
                  ←
                </Link>

                <div className="relative h-11 w-11 shrink-0 border border-[var(--cp-border)] bg-[var(--cp-hover)]">
                  <div className="absolute inset-[5px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_22px_rgba(255,59,36,.2)]" />
                  <div className="absolute inset-[8px] rounded-[45%_55%_65%_35%] bg-[radial-gradient(circle_at_28%_24%,rgba(255,255,255,.45),transparent_28%)]" />
                </div>

                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.38em] text-[#ff6a4f]">
                    Event Reports
                  </p>

                  <h1 className="mt-1 truncate text-sm font-black uppercase tracking-[-0.03em]">
                    Informes históricos
                  </h1>
                </div>
              </div>

            </div>

            <div className="flex items-center gap-3">

              <button
                type="button"
                onClick={
                  toggleTheme
                }
                className="border border-[var(--cp-border)] bg-[var(--cp-hover)] px-3 py-2 text-sm font-black"
              >
                {theme ===
                "dark"
                  ? "☀️"
                  : "🌙"}
              </button>

              <div className="hidden text-right sm:block">

                <p className="text-sm font-bold">
                  {organizerName}
                </p>

                <p className="text-xs text-[var(--cp-muted)]">
                  Organizador
                </p>

              </div>

              <div className="flex h-10 w-10 items-center justify-center border border-[#ff5a2a]/25 bg-[#ff3b24]/10 text-sm font-black">
                {initials}
              </div>

            </div>

          </header>

          <div className="py-10">

            {/* =================================================
                TITULO + VISTAS
            ================================================= */}

            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">

              <div>

                <div className="inline-flex items-center border border-[#ff3b24]/35 bg-[#ff3b24]/[0.08] px-4 py-3">
                  <span className="mr-3 h-2 w-2 bg-[#ff3b24]" />
                  <span className="text-[10px] font-black uppercase tracking-[0.38em] text-[#ffb29f]">
                    Historial de la organización
                  </span>
                </div>

                <h2 className="mt-8 max-w-[760px] bg-gradient-to-br from-[#fff2ea] via-[#ff8c69] to-[#ff2a1a] bg-clip-text text-[clamp(48px,7vw,96px)] font-black uppercase leading-[0.82] tracking-[-0.075em] text-transparent">
                  Leé tus informes.
                </h2>

                <p className="mt-7 max-w-[650px] text-sm leading-7 text-[var(--cp-muted)] md:text-base md:leading-8">
                  Revisá todos tus eventos, ventas, ingresos y rendimiento histórico.
                </p>

              </div>

              <div className="inline-flex border border-[var(--cp-border)] bg-[var(--cp-panel)] p-1">

                <button
                  type="button"
                  onClick={() =>
                    setView(
                      "calendar"
                    )
                  }
                  className={`px-4 py-2.5 text-sm transition ${
                    view ===
                    "calendar"
                      ? "bg-[#ff3b24]/15 text-[#ff6040]"
                      : "text-[var(--cp-muted)]"
                  }`}
                >
                  📅 Calendario
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setView(
                      "history"
                    )
                  }
                  className={`px-4 py-2.5 text-sm transition ${
                    view ===
                    "history"
                      ? "bg-[#ff3b24]/15 text-[#ff6040]"
                      : "text-[var(--cp-muted)]"
                  }`}
                >
                  ☰ Historial
                </button>

              </div>

            </div>

            {/* =================================================
                SIN EVENTOS
            ================================================= */}

            {reports.length ===
              0 && (
              <section className="mt-7 border border-[var(--cp-border)] bg-[var(--cp-panel)] p-8">
                <p className="text-sm text-[var(--cp-muted)]">
                  Todavía no hay eventos
                  para mostrar en el
                  historial.
                </p>
              </section>
            )}

            {/* =================================================
                CALENDARIO
            ================================================= */}

            {reports.length >
              0 &&
              view ===
                "calendar" && (
                <section className="mt-7 grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">

                  {/* =================================================
                      COLUMNA IZQUIERDA
                  ================================================= */}

                  <div>

                    {/* CALENDARIO */}

                    <div className="border border-[var(--cp-border)] bg-[var(--cp-panel)] p-5 md:p-6">

                      {/* MES */}

                      <div className="flex items-center justify-between">

                        <button
                          type="button"
                          onClick={
                            previousMonth
                          }
                          className="flex h-10 w-10 items-center justify-center border border-[var(--cp-border)] bg-[var(--cp-hover)]"
                        >
                          ←
                        </button>

                        <div className="text-center">

                          <p className="font-black">
                            {
                              MONTHS[
                                calendarMonth
                              ]
                            }
                          </p>

                          <p className="mt-1 text-xs text-[var(--cp-muted)]">
                            {
                              calendarYear
                            }
                          </p>

                        </div>

                        <button
                          type="button"
                          onClick={
                            nextMonth
                          }
                          className="flex h-10 w-10 items-center justify-center border border-[var(--cp-border)] bg-[var(--cp-hover)]"
                        >
                          →
                        </button>

                      </div>

                      {/* DÍAS */}

                      <div className="mt-6 grid grid-cols-7 gap-1">

                        {WEEKDAYS.map(
                          (day) => (
                            <div
                              key={day}
                              className="pb-2 text-center text-[10px] font-black uppercase text-[var(--cp-muted)]"
                            >
                              {day}
                            </div>
                          )
                        )}

                        {calendarDays.map(
                          (
                            cell,
                            index
                          ) => {
                            if (
                              cell ===
                              null
                            ) {
                              return (
                                <div
                                  key={`empty-${index}`}
                                  className="aspect-square"
                                />
                              );
                            }

                            const dayEvents =
                              eventsByDate.get(
                                cell.key
                              ) ?? [];

                            const hasEvent =
                              dayEvents.length >
                              0;

                            return (
                              <button
                                key={
                                  cell.key
                                }
                                type="button"
                                disabled={
                                  !hasEvent
                                }
                                onClick={() => {
                                  const firstEvent =
                                    dayEvents[0];

                                  if (
                                    firstEvent
                                  ) {
                                    setSelectedEventId(
                                      firstEvent
                                        .event
                                        .id
                                    );
                                  }
                                }}
                                className={`relative aspect-square border text-sm transition ${
                                  hasEvent
                                    ? "border-[#ff5a2a]/25 bg-[#ff3b24]/[0.08] hover:bg-[#ff3b24]/[0.16]"
                                    : "border-transparent text-[var(--cp-muted)]"
                                }`}
                              >
                                <span>
                                  {
                                    cell.day
                                  }
                                </span>

                                {hasEvent && (
                                  <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">

                                    {dayEvents
                                      .slice(
                                        0,
                                        3
                                      )
                                      .map(
                                        (
                                          report
                                        ) => (
                                          <span
                                            key={
                                              report
                                                .event
                                                .id
                                            }
                                            className={`h-1.5 w-1.5 ${getStatusDot(
                                              report
                                                .event
                                                .status
                                            )}`}
                                          />
                                        )
                                      )}

                                  </div>
                                )}
                              </button>
                            );
                          }
                        )}

                      </div>

                      {/* LEYENDA */}

                      <div className="mt-6 flex flex-wrap gap-4 border-t border-[var(--cp-border)] pt-5 text-xs text-[var(--cp-muted)]">

                        <Legend
                          color="bg-[#ff5a2a]"
                          label="Próximo"
                        />

                        <Legend
                          color="bg-emerald-400"
                          label="Activo"
                        />

                        <Legend
                          color="bg-gray-400"
                          label="Finalizado"
                        />

                        <Legend
                          color="bg-red-400"
                          label="Cancelado"
                        />

                      </div>

                    </div>

                    {/* EVENTOS DEL MES */}

                    <div className="mt-5 border border-[var(--cp-border)] bg-[var(--cp-panel)]">

                      <div className="border-b border-[var(--cp-border)] px-5 py-4">

                        <h3 className="text-sm font-black">
                          Eventos del mes
                        </h3>

                      </div>

                      <div className="divide-y divide-[var(--cp-border)]">

                        {reports
                          .filter(
                            (
                              report
                            ) => {
                              const date =
                                new Date(
                                  report
                                    .event
                                    .startsAt
                                );

                              return (
                                date.getFullYear() ===
                                  calendarYear &&
                                date.getMonth() ===
                                  calendarMonth
                              );
                            }
                          )
                          .map(
                            (
                              report
                            ) => (
                              <button
                                key={
                                  report
                                    .event
                                    .id
                                }
                                type="button"
                                onClick={() =>
                                  setSelectedEventId(
                                    report
                                      .event
                                      .id
                                  )
                                }
                                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[var(--cp-hover)]"
                              >
                                <div>

                                  <p className="text-sm font-bold">
                                    {
                                      report
                                        .event
                                        .name
                                    }
                                  </p>

                                  <p className="mt-1 text-xs text-[var(--cp-muted)]">
                                    {formatShortDate(
                                      report
                                        .event
                                        .startsAt
                                    )}
                                  </p>

                                </div>

                                <span
                                  className={`px-2.5 py-1 text-[10px] ${getStatusBadge(
                                    report
                                      .event
                                      .status
                                  )}`}
                                >
                                  {formatStatus(
                                    report
                                      .event
                                      .status
                                  )}
                                </span>

                              </button>
                            )
                          )}

                        {reports.filter(
                          (
                            report
                          ) => {
                            const date =
                              new Date(
                                report
                                  .event
                                  .startsAt
                              );

                            return (
                              date.getFullYear() ===
                                calendarYear &&
                              date.getMonth() ===
                                calendarMonth
                            );
                          }
                        ).length ===
                          0 && (
                          <p className="p-5 text-sm text-[var(--cp-muted)]">
                            No hay eventos
                            este mes.
                          </p>
                        )}

                      </div>

                    </div>

                  </div>

                  {/* =================================================
                      INFORME EVENTO
                  ================================================= */}

                  <div>

                    {selectedReport ? (
                      <EventReport
                        report={
                          selectedReport
                        }
                      />
                    ) : (
                      <div className="border border-[var(--cp-border)] bg-[var(--cp-panel)] p-8">
                        <p className="text-sm text-[var(--cp-muted)]">
                          Seleccioná un
                          evento del
                          calendario.
                        </p>
                      </div>
                    )}

                  </div>

                </section>
              )}

            {/* =================================================
                HISTORIAL
            ================================================= */}

            {reports.length >
              0 &&
              view ===
                "history" && (
                <section className="mt-7">

                  {/* BUSCADOR */}

                  <div className="border border-[var(--cp-border)] bg-[var(--cp-panel)] p-4">

                    <input
                      value={search}
                      onChange={(e) =>
                        setSearch(
                          e.target.value
                        )
                      }
                      placeholder="Buscar evento, ciudad o lugar..."
                      className="h-12 w-full border border-[var(--cp-border)] bg-[var(--cp-hover)] px-4 text-sm outline-none placeholder:text-[var(--cp-muted)] focus:border-[#ff5a2a]/50"
                    />

                  </div>

                  <div className="mt-5 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">

                    {/* HISTORIAL POR AÑO */}

                    <div className="space-y-5">

                      {reportsByYear.map(
                        ([
                          year,
                          yearReports,
                        ]) => (
                          <section
                            key={year}
                            className="overflow-hidden border border-[var(--cp-border)] bg-[var(--cp-panel)]"
                          >

                            <div className="border-b border-[var(--cp-border)] px-5 py-4">

                              <h3 className="text-xl font-black tracking-[-0.04em]">
                                {year}
                              </h3>

                            </div>

                            <div className="divide-y divide-[var(--cp-border)]">

                              {yearReports.map(
                                (
                                  report
                                ) => (
                                  <button
                                    key={
                                      report
                                        .event
                                        .id
                                    }
                                    type="button"
                                    onClick={() =>
                                      setSelectedEventId(
                                        report
                                          .event
                                          .id
                                      )
                                    }
                                    className={`w-full px-5 py-5 text-left transition hover:bg-[var(--cp-hover)] ${
                                      selectedEventId ===
                                      report
                                        .event
                                        .id
                                        ? "bg-[#ff3b24]/[0.08]"
                                        : ""
                                    }`}
                                  >

                                    <div className="flex items-start justify-between gap-4">

                                      <div>

                                        <p className="font-bold">
                                          {
                                            report
                                              .event
                                              .name
                                          }
                                        </p>

                                        <p className="mt-1 text-xs text-[var(--cp-muted)]">
                                          {formatShortDate(
                                            report
                                              .event
                                              .startsAt
                                          )}
                                        </p>

                                        <p className="mt-1 text-xs text-[var(--cp-muted)]">
                                          {[
                                            report
                                              .event
                                              .venueName,
                                            report
                                              .event
                                              .city,
                                          ]
                                            .filter(
                                              Boolean
                                            )
                                            .join(
                                              " · "
                                            )}
                                        </p>

                                      </div>

                                      <span
                                        className={`px-2.5 py-1 text-[10px] ${getStatusBadge(
                                          report
                                            .event
                                            .status
                                        )}`}
                                      >
                                        {formatStatus(
                                          report
                                            .event
                                            .status
                                        )}
                                      </span>

                                    </div>

                                    <div className="mt-4 flex gap-5 text-xs text-[var(--cp-muted)]">

                                      <span>
                                        {
                                          report
                                            .metrics
                                            .ticketsSold
                                        }{" "}
                                        entradas
                                      </span>

                                      <span>
                                        Bruto{" "}
                                        {formatMoney(
                                          report
                                            .metrics
                                            .grossRevenue
                                        )}
                                      </span>

                                      <span className="font-bold text-emerald-400">
                                        Neto{" "}
                                        {formatMoney(
                                          report
                                            .metrics
                                            .netRevenue
                                        )}
                                      </span>

                                    </div>

                                  </button>
                                )
                              )}

                            </div>

                          </section>
                        )
                      )}

                    </div>

                    {/* INFORME */}

                    <div>

                      {selectedReport && (
                        <EventReport
                          report={
                            selectedReport
                          }
                        />
                      )}

                    </div>

                  </div>

                </section>
              )}

          </div>

        </section>

      </div>

    </main>
  );
}

// =====================================================
// INFORME DEL EVENTO
// =====================================================

function EventReport({
  report,
}: {
  report: Report;
}) {
  const {
    event,
    metrics,
    ticketTypes,
    sellers,
    controllers,
  } = report;

  const rrppSellers =
    sellers.filter(
      (seller) =>
        seller.channel === "rrpp"
    );

  return (
    <div className="space-y-5">

      {/* =================================================
          EVENTO
      ================================================= */}

      <section className="border border-[#ff5a2a]/20 bg-gradient-to-br from-[#ff3b24]/[0.10] to-[var(--cp-panel)] p-6">

        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">

          <div>

            <span
              className={`px-2.5 py-1 text-[10px] ${getStatusBadge(
                event.status
              )}`}
            >
              {formatStatus(
                event.status
              )}
            </span>

            <h2 className="mt-4 text-2xl font-black tracking-[-0.045em]">
              {event.name}
            </h2>

            <p className="mt-2 text-sm text-[var(--cp-muted)]">
              {formatFullDate(
                event.startsAt
              )}
            </p>

            <p className="mt-1 text-xs text-[var(--cp-muted)]">
              {[
                event.venueName,
                event.city,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

          </div>

          <Link
            href={`/e/${event.slug}`}
            target="_blank"
            className="border border-[var(--cp-border)] bg-[var(--cp-hover)] px-4 py-2.5 text-xs"
          >
            Ver evento
          </Link>

        </div>

      </section>

      {/* =================================================
          RESUMEN FINANCIERO
      ================================================= */}

      <section className="border border-[var(--cp-border)] bg-[var(--cp-panel)] p-5">

        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">

          <div>

            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ff6040]">
              Resultado del evento
            </p>

            <h3 className="mt-1 font-black">
              Resumen financiero
            </h3>

          </div>

          <p className="text-xs text-[var(--cp-muted)]">
            Neto = venta bruta − reintegros realizados
          </p>

        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">

          <SmallMetric
            title="Venta bruta"
            value={formatMoney(
              metrics.grossRevenue
            )}
            detail={`${metrics.sales} operaciones`}
            tone="accent"
          />

          <SmallMetric
            title="Reintegrado"
            value={formatMoney(
              metrics.refundedAmount
            )}
            detail={`${metrics.returnedTickets} ${
              metrics.returnedTickets === 1
                ? "devolución"
                : "devoluciones"
            }`}
            tone="red"
          />

          <SmallMetric
            title="Venta neta"
            value={formatMoney(
              metrics.netRevenue
            )}
            detail="resultado actual"
            tone="green"
          />

        </div>

        {metrics.pendingRefundAmount >
          0 && (

          <div className="mt-3 flex flex-col justify-between gap-2 border border-amber-400/15 bg-amber-400/[0.05] px-4 py-3 sm:flex-row sm:items-center">

            <div>

              <p className="text-xs font-black text-amber-200">
                Reintegros pendientes
              </p>

              <p className="mt-1 text-xs text-[var(--cp-muted)]">
                Todavía no se descuentan de la venta neta.
              </p>

            </div>

            <p className="font-black text-amber-200">
              {formatMoney(
                metrics.pendingRefundAmount
              )}
            </p>

          </div>

        )}

      </section>

      {/* =================================================
          ENTRADAS / OPERACIÓN
      ================================================= */}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

        <SmallMetric
          title="Entradas emitidas"
          value={String(
            metrics.ticketsIssued
          )}
          detail="históricas"
        />

        <SmallMetric
          title="Entradas válidas"
          value={String(
            metrics.ticketsSold
          )}
          detail="vigentes + usadas"
          tone="green"
        />

        <SmallMetric
          title="Devueltas"
          value={String(
            metrics.returnedTickets
          )}
          detail={formatMoney(
            metrics.returnAmount
          )}
          tone="red"
        />

        <SmallMetric
          title="Ingresaron"
          value={String(
            metrics.usedTickets
          )}
          detail={`${metrics.attendancePercentage}%`}
          tone="accent"
        />

        <SmallMetric
          title="No ingresaron"
          value={String(
            metrics.pendingTickets
          )}
        />

        <SmallMetric
          title="Compradores"
          value={String(
            metrics.buyers
          )}
        />

        <SmallMetric
          title="Operaciones"
          value={String(
            metrics.sales
          )}
        />

        <SmallMetric
          title="Anuladas"
          value={String(
            metrics.cancelledTickets
          )}
          detail="tickets cancelados"
        />

      </section>

      {/* =================================================
          CANALES
      ================================================= */}

      <section className="border border-[var(--cp-border)] bg-[var(--cp-panel)] p-5">

        <div>

          <h3 className="font-black">
            Ventas por canal
          </h3>

          <p className="mt-1 text-xs text-[var(--cp-muted)]">
            Bruto, reintegros y resultado neto por origen de venta.
          </p>

        </div>

        <div className="mt-5 space-y-3">

          <ChannelRow
            name="RRPP"
            sales={
              metrics.rrppSales
            }
            revenue={
              metrics.rrppRevenue
            }
            refunded={
              metrics.rrppRefunded
            }
            netRevenue={
              metrics.rrppNetRevenue
            }
          />

          <ChannelRow
            name="Organizador"
            sales={
              metrics.organizerSales
            }
            revenue={
              metrics.organizerRevenue
            }
            refunded={
              metrics.organizerRefunded
            }
            netRevenue={
              metrics.organizerNetRevenue
            }
          />

          <ChannelRow
            name="Puerta"
            sales={
              metrics.doorSales
            }
            revenue={
              metrics.doorRevenue
            }
            refunded={
              metrics.doorRefunded
            }
            netRevenue={
              metrics.doorNetRevenue
            }
          />

        </div>

      </section>

      {/* =================================================
          COMISIONES RRPP
      ================================================= */}

      <section className="overflow-hidden border border-amber-400/15 bg-gradient-to-br from-amber-400/[0.045] to-[var(--cp-panel)]">

        <div className="border-b border-amber-400/10 px-5 py-4">

          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">

            <div>

              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-300/80">
                Liquidaciones
              </p>

              <h3 className="mt-1 font-black">
                Comisiones RRPP
              </h3>

            </div>

            <p className="text-xs text-[var(--cp-muted)]">
              Calculadas sobre ventas válidas luego de devoluciones.
            </p>

          </div>

        </div>

        <div className="p-5">

          <div className="grid gap-3 sm:grid-cols-3">

            <SmallMetric
              title="Generadas"
              value={formatMoney(
                metrics.rrppCommissionGenerated
              )}
              detail="comisión acumulada"
              tone="amber"
            />

            <SmallMetric
              title="Pagadas"
              value={formatMoney(
                metrics.rrppCommissionPaid
              )}
              detail="liquidado"
              tone="green"
            />

            <SmallMetric
              title="Pendientes"
              value={formatMoney(
                metrics.rrppCommissionPending
              )}
              detail="saldo por pagar"
              tone={
                metrics.rrppCommissionPending >
                0
                  ? "amber"
                  : "green"
              }
            />

          </div>

          {rrppSellers.length ===
          0 ? (

            <div className="mt-4 border border-[var(--cp-border)] bg-[var(--cp-hover)] px-4 py-4">

              <p className="text-sm text-[var(--cp-muted)]">
                Este evento no registra ventas realizadas por RRPP.
              </p>

            </div>

          ) : (

            <div className="mt-5 overflow-hidden border border-[var(--cp-border)] bg-[var(--cp-panel)]">

              <div className="border-b border-[var(--cp-border)] px-4 py-3">

                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--cp-muted)]">
                  Detalle por RRPP
                </p>

              </div>

              <div className="divide-y divide-[var(--cp-border)]">

                {rrppSellers.map(
                  (seller) => (

                    <div
                      key={
                        seller.memberId
                      }
                      className="px-4 py-4"
                    >

                      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">

                        <div>

                          <div className="flex flex-wrap items-center gap-2">

                            <p className="text-sm font-black">
                              {
                                seller.name
                              }
                            </p>

                            <span className="border border-amber-400/15 bg-amber-400/[0.06] px-2.5 py-1 text-[10px] font-black text-amber-200">
                              {formatPercentage(
                                seller.commissionPercentage
                              )} comisión
                            </span>

                          </div>

                          <p className="mt-2 text-xs text-[var(--cp-muted)]">
                            Base comisionable:{" "}
                            <span className="font-bold text-[var(--cp-text)]">
                              {formatMoney(
                                seller.commissionBase
                              )}
                            </span>
                            {" · "}
                            {seller.tickets} entradas
                            {" · "}
                            {seller.sales} ventas
                          </p>

                          {seller.returnedTickets >
                            0 && (

                            <p className="mt-1 text-xs text-red-300/75">
                              {
                                seller.returnedTickets
                              }{" "}
                              {seller.returnedTickets ===
                              1
                                ? "devolución descontada de la base"
                                : "devoluciones descontadas de la base"}
                            </p>

                          )}

                        </div>

                        <div className="grid grid-cols-3 gap-5 lg:min-w-[360px] lg:text-right">

                          <div>

                            <p className="text-[9px] uppercase tracking-[0.1em] text-amber-300/60">
                              Generada
                            </p>

                            <p className="mt-1 text-sm font-black text-amber-100">
                              {formatMoney(
                                seller.commissionGenerated
                              )}
                            </p>

                          </div>

                          <div>

                            <p className="text-[9px] uppercase tracking-[0.1em] text-emerald-400/60">
                              Pagada
                            </p>

                            <p className="mt-1 text-sm font-black text-emerald-300">
                              {formatMoney(
                                seller.commissionPaid
                              )}
                            </p>

                          </div>

                          <div>

                            <p className="text-[9px] uppercase tracking-[0.1em] text-orange-300/60">
                              Pendiente
                            </p>

                            <p
                              className={`mt-1 text-sm font-black ${
                                seller.commissionPending >
                                0
                                  ? "text-orange-200"
                                  : "text-emerald-300"
                              }`}
                            >
                              {formatMoney(
                                seller.commissionPending
                              )}
                            </p>

                          </div>

                        </div>

                      </div>

                    </div>

                  )
                )}

              </div>

            </div>

          )}

        </div>

      </section>

      {/* =================================================
          TANDAS
      ================================================= */}

      <section className="overflow-hidden border border-[var(--cp-border)] bg-[var(--cp-panel)]">

        <div className="border-b border-[var(--cp-border)] px-5 py-4">

          <h3 className="font-black">
            Tandas
          </h3>

        </div>

        {ticketTypes.length ===
        0 ? (

          <p className="p-5 text-sm text-[var(--cp-muted)]">
            Sin tandas registradas.
          </p>

        ) : (

          <div className="divide-y divide-[var(--cp-border)]">

            {ticketTypes.map(
              (type) => (
                <div
                  key={
                    type.id
                  }
                  className="px-5 py-4"
                >

                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">

                    <div>

                      <p className="text-sm font-bold">
                        {type.name}
                      </p>

                      <p className="mt-1 text-xs text-[var(--cp-muted)]">
                        {type.sold} válidas
                        de{" "}
                        {type.capacity}
                        {" · "}
                        {type.returned}{" "}
                        {type.returned ===
                        1
                          ? "devuelta"
                          : "devueltas"}
                      </p>

                    </div>

                    <div className="grid grid-cols-3 gap-4 text-left sm:text-right">

                      <div>

                        <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--cp-muted)]">
                          Bruto
                        </p>

                        <p className="mt-1 text-xs font-black">
                          {formatMoney(
                            type.revenue
                          )}
                        </p>

                      </div>

                      <div>

                        <p className="text-[9px] uppercase tracking-[0.1em] text-red-400/70">
                          Reintegrado
                        </p>

                        <p className="mt-1 text-xs font-black text-red-300">
                          {formatMoney(
                            type.refunded
                          )}
                        </p>

                      </div>

                      <div>

                        <p className="text-[9px] uppercase tracking-[0.1em] text-emerald-400/70">
                          Neto
                        </p>

                        <p className="mt-1 text-xs font-black text-emerald-300">
                          {formatMoney(
                            type.netRevenue
                          )}
                        </p>

                      </div>

                    </div>

                  </div>

                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--cp-muted)]">

                    <span>
                      Ingresaron:{" "}
                      {type.used}
                    </span>

                    <span>
                      No ingresaron:{" "}
                      {Math.max(
                        0,
                        type.sold -
                          type.used
                      )}
                    </span>

                    {type.returned >
                      0 && (

                      <span className="text-red-300/80">
                        Devueltas:{" "}
                        {type.returned}
                      </span>

                    )}

                  </div>

                </div>
              )
            )}

          </div>

        )}

      </section>

      {/* =================================================
          VENDEDORES
      ================================================= */}

      <section className="overflow-hidden border border-[var(--cp-border)] bg-[var(--cp-panel)]">

        <div className="border-b border-[var(--cp-border)] px-5 py-4">

          <h3 className="font-black">
            Rendimiento de vendedores
          </h3>

        </div>

        {sellers.length ===
        0 ? (

          <p className="p-5 text-sm text-[var(--cp-muted)]">
            Sin vendedores registrados.
          </p>

        ) : (

          <div className="divide-y divide-[var(--cp-border)]">

            {sellers.map(
              (
                seller,
                index
              ) => (
                <div
                  key={
                    seller.memberId
                  }
                  className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center"
                >

                  <div className="flex items-center gap-3">

                    <div className="flex h-8 w-8 items-center justify-center bg-[#ff3b24]/10 text-xs text-[#ff6040]">
                      {index + 1}
                    </div>

                    <div>

                      <p className="text-sm font-bold">
                        {
                          seller.name
                        }
                      </p>

                      <p className="mt-1 text-xs text-[var(--cp-muted)]">
                        {formatChannel(
                          seller.channel
                        )}{" "}
                        ·{" "}
                        {
                          seller.tickets
                        }{" "}
                        entradas
                        {" · "}
                        {
                          seller.sales
                        }{" "}
                        ventas
                      </p>

                      {seller.returnedTickets >
                        0 && (

                        <p className="mt-1 text-xs text-red-300/75">
                          {
                            seller.returnedTickets
                          }{" "}
                          {seller.returnedTickets ===
                          1
                            ? "entrada devuelta"
                            : "entradas devueltas"}
                        </p>

                      )}

                    </div>

                  </div>

                  <div className="grid grid-cols-3 gap-4 md:min-w-[310px] md:text-right">

                    <div>

                      <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--cp-muted)]">
                        Bruto
                      </p>

                      <p className="mt-1 text-xs font-black">
                        {formatMoney(
                          seller.revenue
                        )}
                      </p>

                    </div>

                    <div>

                      <p className="text-[9px] uppercase tracking-[0.1em] text-red-400/70">
                        Reintegrado
                      </p>

                      <p className="mt-1 text-xs font-black text-red-300">
                        {formatMoney(
                          seller.refunded
                        )}
                      </p>

                    </div>

                    <div>

                      <p className="text-[9px] uppercase tracking-[0.1em] text-emerald-400/70">
                        Neto
                      </p>

                      <p className="mt-1 text-xs font-black text-emerald-300">
                        {formatMoney(
                          seller.netRevenue
                        )}
                      </p>

                    </div>

                  </div>

                </div>
              )
            )}

          </div>

        )}

      </section>

      {/* =================================================
          INGRESOS
      ================================================= */}

      <section className="border border-[var(--cp-border)] bg-[var(--cp-panel)] p-5">

        <h3 className="font-black">
          Ingresos
        </h3>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">

          <InfoBox
            label="Primer ingreso"
            value={
              metrics.firstEntry
                ? formatTime(
                    metrics.firstEntry
                  )
                : "—"
            }
          />

          <InfoBox
            label="Último ingreso"
            value={
              metrics.lastEntry
                ? formatTime(
                    metrics.lastEntry
                  )
                : "—"
            }
          />

        </div>

      </section>

      {/* =================================================
          CONTROLADORES
      ================================================= */}

      <section className="overflow-hidden border border-[var(--cp-border)] bg-[var(--cp-panel)]">

        <div className="border-b border-[var(--cp-border)] px-5 py-4">

          <h3 className="font-black">
            Controladores
          </h3>

        </div>

        {controllers.length ===
        0 ? (

          <p className="p-5 text-sm text-[var(--cp-muted)]">
            Sin controladores registrados.
          </p>

        ) : (

          <div className="divide-y divide-[var(--cp-border)]">

            {controllers.map(
              (
                controller
              ) => (
                <div
                  key={
                    controller.memberId
                  }
                  className="flex items-center justify-between px-5 py-4"
                >

                  <p className="text-sm">
                    {
                      controller.name
                    }
                  </p>

                  <span
                    className={`px-2.5 py-1 text-[10px] ${
                      controller.active
                        ? "bg-emerald-400/10 text-emerald-400"
                        : "bg-orange-400/10 text-orange-400"
                    }`}
                  >
                    {controller.active
                      ? "Activo"
                      : "Pausado"}
                  </span>

                </div>
              )
            )}

          </div>

        )}

      </section>

    </div>
  );
}

// =====================================================
// COMPONENTES
// =====================================================

function MenuItem({
  label,
  href,
  active = false,
}: {
  label: string;
  href: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 border px-4 py-3 text-sm transition ${
        active
          ? "border-[#ff5a2a]/20 bg-[#ff3b24]/10"
          : "border-transparent text-[var(--cp-muted)] hover:bg-[var(--cp-hover)]"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 ${
          active
            ? "bg-[#ff5a2a]"
            : "bg-gray-500"
        }`}
      />

      {label}
    </Link>
  );
}

function SmallMetric({
  title,
  value,
  detail,
  accent = false,
  tone = "default",
}: {
  title: string;
  value: string;
  detail?: string;
  accent?: boolean;
  tone?:
    | "default"
    | "accent"
    | "green"
    | "red"
    | "amber";
}) {
  const resolvedTone =
    accent
      ? "accent"
      : tone;

  const cardClass =
    resolvedTone === "accent"
      ? "border-[#ff5a2a]/20 bg-[#ff3b24]/[0.08]"
      : resolvedTone === "green"
        ? "border-emerald-400/20 bg-emerald-400/[0.06]"
        : resolvedTone === "red"
          ? "border-red-400/20 bg-red-400/[0.05]"
          : resolvedTone === "amber"
            ? "border-amber-400/20 bg-amber-400/[0.055]"
            : "border-[var(--cp-border)] bg-[var(--cp-panel)]";

  const detailClass =
    resolvedTone === "green"
      ? "text-emerald-400"
      : resolvedTone === "red"
        ? "text-red-400"
        : resolvedTone === "amber"
          ? "text-amber-300"
          : "text-[#ff6040]";

  return (
    <div
      className={`border p-4 ${cardClass}`}
    >
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--cp-muted)]">
        {title}
      </p>

      <div className="mt-3 flex items-end justify-between gap-3">

        <p className="text-2xl font-black tracking-[-0.045em]">
          {value}
        </p>

        {detail && (
          <span className={`text-right text-xs ${detailClass}`}>
            {detail}
          </span>
        )}

      </div>
    </div>
  );
}

function ChannelRow({
  name,
  sales,
  revenue,
  refunded,
  netRevenue,
}: {
  name: string;
  sales: number;
  revenue: number;
  refunded: number;
  netRevenue: number;
}) {
  return (
    <div className="grid gap-4 bg-[var(--cp-hover)] px-4 py-4 md:grid-cols-[1fr_auto] md:items-center">

      <div>

        <p className="text-sm font-bold">
          {name}
        </p>

        <p className="mt-1 text-xs text-[var(--cp-muted)]">
          {sales} operaciones
        </p>

      </div>

      <div className="grid grid-cols-3 gap-5 md:min-w-[330px] md:text-right">

        <div>

          <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--cp-muted)]">
            Bruto
          </p>

          <p className="mt-1 text-xs font-black">
            {formatMoney(
              revenue
            )}
          </p>

        </div>

        <div>

          <p className="text-[9px] uppercase tracking-[0.1em] text-red-400/70">
            Reintegrado
          </p>

          <p className="mt-1 text-xs font-black text-red-300">
            {formatMoney(
              refunded
            )}
          </p>

        </div>

        <div>

          <p className="text-[9px] uppercase tracking-[0.1em] text-emerald-400/70">
            Neto
          </p>

          <p className="mt-1 text-xs font-black text-emerald-300">
            {formatMoney(
              netRevenue
            )}
          </p>

        </div>

      </div>

    </div>
  );
}

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="bg-[var(--cp-hover)] p-4">

      <p className="text-xs text-[var(--cp-muted)]">
        {label}
      </p>

      <p className="mt-2 font-black">
        {value}
      </p>

    </div>
  );
}

function Legend({
  color,
  label,
}: {
  color: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">

      <span
        className={`h-2 w-2 ${color}`}
      />

      {label}

    </div>
  );
}

// =====================================================
// HELPERS
// =====================================================

function formatMoney(
  value: number
) {
  return new Intl.NumberFormat(
    "es-AR",
    {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }
  ).format(value);
}

function formatPercentage(
  value: number
) {
  return new Intl.NumberFormat(
    "es-AR",
    {
      maximumFractionDigits: 2,
    }
  ).format(value) + "%";
}

function formatChannel(
  channel: string
) {
  if (
    channel === "rrpp"
  ) {
    return "RRPP";
  }

  if (
    channel === "door"
  ) {
    return "Puerta";
  }

  return "Organizador";
}

function formatStatus(
  status: string
) {
  if (
    status === "active"
  ) {
    return "Activo";
  }

  if (
    status === "upcoming"
  ) {
    return "Próximo";
  }

  if (
    status === "finished"
  ) {
    return "Finalizado";
  }

  if (
    status === "cancelled"
  ) {
    return "Cancelado";
  }

  return "Borrador";
}

function getStatusDot(
  status: string
) {
  if (
    status === "active"
  ) {
    return "bg-emerald-400";
  }

  if (
    status === "upcoming"
  ) {
    return "bg-[#ff5a2a]";
  }

  if (
    status === "cancelled"
  ) {
    return "bg-red-400";
  }

  return "bg-gray-400";
}

function getStatusBadge(
  status: string
) {
  if (
    status === "active"
  ) {
    return "bg-emerald-400/10 text-emerald-400";
  }

  if (
    status === "upcoming"
  ) {
    return "bg-[#ff5a2a]/10 text-[#ff6040]";
  }

  if (
    status === "cancelled"
  ) {
    return "bg-red-400/10 text-red-400";
  }

  return "bg-gray-400/10 text-gray-400";
}

function formatShortDate(
  value: string
) {
  return new Intl.DateTimeFormat(
    "es-AR",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",

      timeZone:
        "America/Argentina/Buenos_Aires",
    }
  ).format(
    new Date(value)
  );
}

function formatFullDate(
  value: string
) {
  return new Intl.DateTimeFormat(
    "es-AR",
    {
      weekday:
        "long",

      day:
        "2-digit",

      month:
        "long",

      year:
        "numeric",

      hour:
        "2-digit",

      minute:
        "2-digit",

      timeZone:
        "America/Argentina/Buenos_Aires",
    }
  ).format(
    new Date(value)
  );
}

function formatTime(
  value: string
) {
  return new Intl.DateTimeFormat(
    "es-AR",
    {
      hour:
        "2-digit",

      minute:
        "2-digit",

      timeZone:
        "America/Argentina/Buenos_Aires",
    }
  ).format(
    new Date(value)
  );
}

function getDateKey(
  value: string
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        timeZone:
          "America/Argentina/Buenos_Aires",
      }
    ).formatToParts(
      new Date(value)
    );

  const year =
    parts.find(
      (part) =>
        part.type ===
        "year"
    )?.value;

  const month =
    parts.find(
      (part) =>
        part.type ===
        "month"
    )?.value;

  const day =
    parts.find(
      (part) =>
        part.type ===
        "day"
    )?.value;

  return `${year}-${month}-${day}`;
}

function makeDateKey(
  year: number,
  month: number,
  day: number
) {
  return `${year}-${String(
    month + 1
  ).padStart(
    2,
    "0"
  )}-${String(
    day
  ).padStart(
    2,
    "0"
  )}`;
}

