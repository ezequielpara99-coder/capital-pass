"use client";

import Link from "next/link";

import {
  CSSProperties,
  FormEvent,
  useState,
} from "react";

type ControllerData = {
  memberId: string;
  firstName: string;
  lastName: string;
  active: boolean;
};

type EntryData = {
  id: string;
  displayNumber: number;
  manualCode: string;
  usedAt: string | null;
  buyerName: string;
  buyerDni: string | null;
  ticketType: string;
};

type Props = {
  event: {
    id: string;
    name: string;
  };

  organizationName: string;
  organizerName: string;
  initials: string;

  metrics: {
    sold: number;
    used: number;
    pending: number;
  };

  controllers: ControllerData[];
  recentEntries: EntryData[];
};

type Theme = "dark" | "light";

export default function IngresosPanel({
  event,
  organizationName,
  organizerName,
  initials,
  metrics,
  controllers,
  recentEntries,
}: Props) {
  const [theme, setTheme] =
    useState<Theme>(() => {
      if (typeof window === "undefined") return "dark";
      try {
        const saved = localStorage.getItem("capital-pass-theme");
        return saved === "light" ? "light" : "dark";
      } catch {
        return "dark";
      }
    });

  const [modalOpen, setModalOpen] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [changingId, setChangingId] =
    useState<string | null>(null);

  const [error, setError] =
    useState("");

  const [firstName, setFirstName] =
    useState("");

  const [lastName, setLastName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [password, setPassword] =
    useState("");

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

  // Paleta editorial. Se mantiene el selector y la preferencia guardada.
  const themeVars = (theme === "dark"
    ? {
        "--cp-bg": "#050505",
        "--cp-panel": "#0a0908",
        "--cp-text": "#f7f3ed",
        "--cp-muted": "rgba(247,243,237,.50)",
        "--cp-border": "rgba(255,255,255,.09)",
        "--cp-hover": "rgba(255,255,255,.035)",
        "--cp-header": "rgba(5,5,5,.85)",
        "--cp-input": "rgba(0,0,0,.25)",
        "--cp-accent": "#ff9272",
        "--cp-title-from": "#fff2ea",
        "--cp-title-via": "#ff8c69",
        "--cp-success": "#6ee7b7",
        "--cp-warning": "#fdba74",
        "--cp-danger": "#fca5a5",
        "--cp-grain": "rgba(255,255,255,1)",
        "--cp-accent-panel": "linear-gradient(135deg,rgba(255,42,26,.055),rgba(10,9,8,.94) 52%,rgba(255,90,42,.035))",
        "--cp-panel-shadow": "0 25px 80px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.03)",
        colorScheme: "dark",
      }
    : {
        "--cp-bg": "#f7f3ed",
        "--cp-panel": "#fffdfa",
        "--cp-text": "#211912",
        "--cp-muted": "rgba(33,25,18,.64)",
        "--cp-border": "rgba(33,25,18,.15)",
        "--cp-hover": "rgba(33,25,18,.035)",
        "--cp-header": "rgba(247,243,237,.90)",
        "--cp-input": "rgba(33,25,18,.025)",
        "--cp-accent": "#b4321e",
        "--cp-title-from": "#852716",
        "--cp-title-via": "#c63820",
        "--cp-success": "#087344",
        "--cp-warning": "#9a4b06",
        "--cp-danger": "#b42318",
        "--cp-grain": "rgba(33,25,18,1)",
        "--cp-accent-panel": "linear-gradient(135deg,rgba(255,42,26,.055),rgba(255,253,250,.96) 52%,rgba(255,90,42,.035))",
        "--cp-panel-shadow": "0 20px 65px rgba(33,25,18,.045),inset 0 1px 0 rgba(255,255,255,.6)",
        colorScheme: "light",
      }) as CSSProperties &
    Record<`--${string}`, string>;

  // =====================================================
  // CREAR CONTROLADOR
  // =====================================================

  async function createController(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/controladores",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            eventId: event.id,
            firstName,
            lastName,
            email,
            phone,
            password,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "No se pudo crear el controlador."
        );
      }

      window.location.reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo crear el controlador."
      );
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // ACTIVAR / PAUSAR
  // =====================================================

  async function toggleController(
    memberId: string,
    active: boolean
  ) {
    setChangingId(memberId);
    setError("");

    try {
      const response = await fetch(
        "/api/controladores",
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            eventId: event.id,
            memberId,
            active,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "No se pudo actualizar el controlador."
        );
      }

      window.location.reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el controlador."
      );
    } finally {
      setChangingId(null);
    }
  }

  const percentage =
    metrics.sold > 0
      ? Math.round(
          (metrics.used /
            metrics.sold) *
            100
        )
      : 0;


  return (
    <main
      style={themeVars}
      data-theme={theme}
      className="relative min-h-screen overflow-x-hidden bg-[var(--cp-bg)] text-[color:var(--cp-text)] selection:bg-[#ff3b24] selection:text-white"
    >
      <EditorialBackdrop />

      {/* MISMO ENCABEZADO HORIZONTAL QUE EVENT CONTROL */}
      <header className="sticky top-0 z-50 border-b border-[var(--cp-border)] bg-[var(--cp-header)] backdrop-blur-2xl">
        <div className="mx-auto flex min-h-[80px] max-w-[1480px] flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4 md:px-8 xl:px-10">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <Link href="/panel" aria-label="Volver al panel" className={ICON_BUTTON}>
              <span aria-hidden="true">←</span>
            </Link>
            <div className="flex min-w-0 items-center gap-3">
              <BrandMark />
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase tracking-[0.24em] text-[color:var(--cp-accent)]">
                  Event control
                </p>
                <p title={event.name} className="mt-1 truncate text-sm font-black uppercase tracking-[-0.02em]">
                  {event.name}
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              className={ICON_BUTTON}
            >
              <ThemeIcon light={theme === "dark"} />
            </button>
            <div
              title={organizerName}
              aria-label={"Organizador: " + organizerName}
              className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.055] text-[10px] font-black uppercase text-[color:var(--cp-accent)]"
            >
              {initials}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className={PRIMARY_BUTTON + " h-10 w-full gap-3 px-5 sm:w-auto"}
          >
            <span aria-hidden="true">+</span>
            Agregar controlador
          </button>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-[1480px] px-5 py-9 md:px-8 xl:px-10">
        <section className="mb-8 grid gap-7 border-b border-[var(--cp-border)] pb-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-end xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-3 border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.055] px-4 py-2">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#ff3b24] shadow-[0_0_12px_#ff3b24]" />
              <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[color:var(--cp-accent)]">
                Control de acceso
              </span>
            </div>
            <h1 className="mt-7 max-w-[980px] text-[clamp(44px,6vw,82px)] font-black uppercase leading-[0.84] tracking-[-0.065em]">
              Controlá
              <span className="block bg-gradient-to-r from-[var(--cp-title-from)] via-[var(--cp-title-via)] to-[#ff2a1a] bg-clip-text text-transparent">
                ingresos.
              </span>
            </h1>
          </div>
          <div className="min-w-0 max-w-[420px]">
            <p className="text-sm leading-7 text-[color:var(--cp-muted)]">
              Consultá las entradas utilizadas, los accesos pendientes
              y el equipo de controladores de tu evento.
            </p>
            <p className="mt-4 break-words text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--cp-muted)]">
              {organizationName} <span aria-hidden="true" className="mx-2 text-[color:var(--cp-accent)]">/</span> {organizerName}
            </p>
          </div>
        </section>

        {error && <div className="mb-6"><ErrorBox message={error} /></div>}

        {/* MÉTRICAS: MISMO CÁLCULO Y DATOS */}
        <section aria-label="Resumen de ingresos" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Entradas vendidas" value={String(metrics.sold)} detail="tickets emitidos" />
          <MetricCard title="Ingresaron" value={String(metrics.used)} detail={percentage + "% de vendidos"} accent />
          <MetricCard title="Pendientes" value={String(metrics.pending)} detail="todavía no ingresaron" />
          <MetricCard title="Controladores" value={String(controllers.filter((controller) => controller.active).length)} detail="activos en este evento" />
        </section>

        {/* PROGRESO SOBRE ENTRADAS VENDIDAS */}
        <section aria-labelledby="entry-progress-title" className={PANEL + " mt-5 p-5 md:p-6"}>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className={EYEBROW}>Registro de accesos</p>
              <h2 id="entry-progress-title" className="mt-3 text-xl font-black uppercase tracking-[-0.025em]">
                Ocupación registrada
              </h2>
              <p className="mt-2 text-xs leading-5 text-[color:var(--cp-muted)]">
                Sobre entradas vendidas
              </p>
            </div>
            <p className="text-4xl font-black leading-none tabular-nums tracking-[-0.05em] text-[color:var(--cp-accent)] sm:text-5xl">
              {percentage}<span className="ml-1 text-2xl">%</span>
            </p>
          </div>

          <div
            role="progressbar"
            aria-labelledby="entry-progress-title"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.max(0, Math.min(100, percentage))}
            aria-valuetext={percentage + "% de entradas vendidas"}
            className="mt-6 h-2 overflow-hidden bg-[var(--cp-hover)]"
          >
            <div
              className="h-full bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] transition-all motion-reduce:transition-none"
              style={{ width: Math.min(100, percentage) + "%" }}
            />
          </div>
        </section>

        <section className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          {/* CONTROLADORES */}
          <section aria-labelledby="controllers-title" className={PANEL + " min-w-0"}>
            <div className="border-b border-[var(--cp-border)] p-5 md:p-6">
              <p className={EYEBROW}>Equipo de acceso</p>
              <h2 id="controllers-title" className="mt-3 text-xl font-black uppercase tracking-[-0.025em]">
                Controladores
              </h2>
              <p className="mt-2 text-sm leading-6 text-[color:var(--cp-muted)]">
                Personal asignado a este evento.
              </p>
            </div>
            {controllers.length === 0 ? (
              <EmptyState title="Tu equipo empieza acá." description="Todavía no hay controladores. Usá “Agregar controlador” para crear el primero." />
            ) : (
              <div className="divide-y divide-[var(--cp-border)]">
                {controllers.map((controller, index) => (
                  <article key={controller.memberId} className="flex flex-wrap items-center justify-between gap-4 p-5 transition hover:bg-[var(--cp-hover)] md:p-6">
                    <div className="flex min-w-0 flex-1 items-start gap-4">
                      <span aria-hidden="true" className="mt-1 shrink-0 text-[9px] font-black tabular-nums tracking-[0.13em] text-[color:var(--cp-accent)]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 border-l border-[#ff5a2a]/20 pl-4">
                        <h3 className="break-words text-base font-black uppercase leading-6 tracking-[-0.02em]">
                          {controller.firstName} {controller.lastName}
                        </h3>
                        <div className="mt-2 flex items-center gap-2">
                          <span aria-hidden="true" className={"h-1.5 w-1.5 shrink-0 rounded-full " + (controller.active ? "bg-emerald-400" : "bg-orange-400")} />
                          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--cp-muted)]">
                            {controller.active ? "Activo" : "Pausado"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={changingId === controller.memberId}
                      onClick={() => toggleController(controller.memberId, !controller.active)}
                      aria-label={(controller.active ? "Pausar a " : "Activar a ") + controller.firstName + " " + controller.lastName}
                      aria-busy={changingId === controller.memberId}
                      className={STATUS_BUTTON + (controller.active
                        ? " border-orange-400/20 bg-orange-400/[0.055] text-[color:var(--cp-warning)] hover:bg-orange-400/[0.10]"
                        : " border-emerald-400/20 bg-emerald-400/[0.055] text-[color:var(--cp-success)] hover:bg-emerald-400/[0.10]")}
                    >
                      {changingId === controller.memberId ? "..." : controller.active ? "Pausar" : "Activar"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* ÚLTIMOS INGRESOS */}
          <section aria-labelledby="recent-entries-title" className={PANEL + " min-w-0"}>
            <div className="border-b border-[var(--cp-border)] p-5 md:p-6">
              <p className={EYEBROW}>Registro del evento</p>
              <h2 id="recent-entries-title" className="mt-3 text-xl font-black uppercase tracking-[-0.025em]">
                Últimos ingresos
              </h2>
              <p className="mt-2 text-sm leading-6 text-[color:var(--cp-muted)]">
                Entradas utilizadas recientemente.
              </p>
            </div>
            {recentEntries.length === 0 ? (
              <EmptyState title="Sin ingresos registrados." description="Todavía no se registraron ingresos." />
            ) : (
              <div className="divide-y divide-[var(--cp-border)]">
                {recentEntries.map((entry) => (
                  <article key={entry.id} className="flex flex-wrap items-start justify-between gap-x-5 gap-y-4 p-5 transition hover:bg-[var(--cp-hover)] md:p-6">
                    <div className="min-w-0 flex-1 border-l border-[#ff5a2a]/20 pl-4">
                      <h3 className="break-words text-base font-black uppercase leading-6 tracking-[-0.02em]">
                        {entry.buyerName}
                      </h3>
                      <p className="mt-2 break-words text-xs leading-5 text-[color:var(--cp-muted)]">
                        {entry.ticketType} · <span className="tabular-nums">#{String(entry.displayNumber).padStart(7, "0")}</span>
                      </p>
                      {entry.buyerDni && (
                        <p className="mt-1 break-words text-xs leading-5 text-[color:var(--cp-muted)]">
                          DNI {entry.buyerDni}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="inline-flex items-center gap-2 border border-emerald-400/20 bg-emerald-400/[0.055] px-3 py-2 text-[9px] font-black uppercase tracking-[0.13em] text-[color:var(--cp-success)]">
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Ingresó
                      </span>
                      <p className="mt-2 text-[11px] tabular-nums text-[color:var(--cp-muted)]">
                        {formatEntryDate(entry.usedAt)}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </div>

      {/* ALTA DE CONTROLADOR */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/75 px-4 py-4 backdrop-blur-sm sm:px-5 sm:py-8">
          <div className="flex min-h-full items-center justify-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-controller-title"
              aria-describedby="new-controller-description"
              className="my-auto w-full max-w-lg border border-[#ff5a2a]/20 bg-[var(--cp-panel)] p-5 text-[color:var(--cp-text)] shadow-2xl sm:p-6"
            >
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className={EYEBROW}>Capital Pass / Accesos</p>
                  <h2 id="new-controller-title" className="mt-3 text-2xl font-black uppercase leading-tight tracking-[-0.04em]">
                    Nuevo controlador
                  </h2>
                  <p id="new-controller-description" className="mt-3 break-words text-sm leading-6 text-[color:var(--cp-muted)]">
                    Se creará una cuenta y quedará asignada a {event.name}.
                  </p>
                </div>
                <button type="button" onClick={() => setModalOpen(false)} aria-label="Cerrar formulario" className={ICON_BUTTON + " text-xl"}>
                  <span aria-hidden="true">×</span>
                </button>
              </div>

              <form onSubmit={createController} className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nombre" value={firstName} onChange={setFirstName} required />
                  <Field label="Apellido" value={lastName} onChange={setLastName} required />
                </div>
                <Field label="Email" type="email" value={email} onChange={setEmail} required />
                <Field label="Teléfono" value={phone} onChange={setPhone} placeholder="Opcional" />
                <Field label="Contraseña inicial" type="password" value={password} onChange={setPassword} required />
                <p className="text-xs leading-5 text-[color:var(--cp-muted)]">
                  El controlador usará este email y contraseña para ingresar a Capital Pass.
                </p>
                {error && <ErrorBox message={error} />}
                <button type="submit" disabled={loading} aria-busy={loading} className={PRIMARY_BUTTON + " h-12 w-full px-5"}>
                  {loading ? "Creando..." : "Crear controlador"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// =====================================================
// ELEMENTOS VISUALES: SIN CLASES GLOBALES ADICIONALES
// =====================================================

const EYEBROW = "text-[9px] font-black uppercase tracking-[0.20em] text-[color:var(--cp-accent)]";
const PANEL = "overflow-hidden border border-[var(--cp-border)] bg-[var(--cp-panel)] shadow-[var(--cp-panel-shadow)]";
const PRIMARY_BUTTON = "inline-flex items-center justify-center bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] text-[9px] font-black uppercase tracking-[0.14em] text-white shadow-[0_14px_40px_rgba(255,59,36,.16)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff7354] disabled:cursor-not-allowed disabled:opacity-45";
const ICON_BUTTON = "flex h-10 w-10 shrink-0 items-center justify-center border border-[var(--cp-border)] bg-[var(--cp-hover)] text-[color:var(--cp-muted)] transition hover:border-[#ff5a2a]/30 hover:text-[color:var(--cp-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff7354]";
const STATUS_BUTTON = "inline-flex min-h-[44px] shrink-0 items-center justify-center border px-4 py-3 text-[9px] font-black uppercase tracking-[0.13em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff7354] disabled:cursor-not-allowed disabled:opacity-45";

function EditorialBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -left-[260px] -top-[280px] h-[680px] w-[680px] rounded-full bg-[#ff2a1a]/[0.11] blur-[185px]" />
      <div className="absolute -right-[280px] top-[15%] h-[700px] w-[700px] rounded-full bg-[#ff5a2a]/[0.08] blur-[190px]" />
      <div className="absolute bottom-[-350px] left-[25%] h-[650px] w-[820px] rounded-[50%] bg-[radial-gradient(ellipse_at_top,rgba(255,124,76,.18)_0%,rgba(255,59,36,.09)_25%,rgba(76,14,7,.06)_50%,transparent_72%)] blur-[40px]" />
      <div className="absolute inset-0 opacity-[0.033]">
        <div className="h-full w-full bg-[radial-gradient(circle,var(--cp-grain)_0.6px,transparent_0.8px)] bg-[size:5px_5px]" />
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div aria-hidden="true" className="relative hidden h-9 w-9 shrink-0 overflow-hidden sm:block">
      <div className="absolute inset-[5px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_22px_rgba(255,59,36,.2)]" />
      <div className="absolute inset-[7px] rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.6),transparent_35%)]" />
    </div>
  );
}

function ThemeIcon({ light }: { light: boolean }) {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {light ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      ) : <path d="M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13Z" />}
    </svg>
  );
}

function MetricCard({
  title,
  value,
  detail,
  accent = false,
}: {
  title: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div
      className={PANEL + " min-w-0 p-5 md:p-6"}
      style={accent ? { backgroundImage: "var(--cp-accent-panel)", borderColor: "rgba(255,90,42,.20)" } : undefined}
    >
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[color:var(--cp-muted)]">{title}</p>
      <p className={"mt-5 break-words text-4xl font-black leading-none tabular-nums tracking-[-0.05em] " + (accent ? "text-[color:var(--cp-accent)]" : "")}>
        {value}
      </p>
      <p className="mt-3 text-xs leading-5 text-[color:var(--cp-muted)]">{detail}</p>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-5 md:p-6">
      <div className="border border-dashed border-[var(--cp-border)] bg-[var(--cp-hover)] px-5 py-8">
        <p className="text-base font-black uppercase tracking-[-0.02em]">{title}</p>
        <p className="mt-3 text-sm leading-6 text-[color:var(--cp-muted)]">{description}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required = false,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--cp-muted)]">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 h-12 w-full border border-[var(--cp-border)] bg-[var(--cp-input)] px-4 text-sm text-[color:var(--cp-text)] outline-none transition placeholder:text-[color:var(--cp-muted)] focus:border-[#ff5a2a]/60 focus:ring-1 focus:ring-[#ff5a2a]/30"
      />
    </label>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-sm text-[color:var(--cp-danger)]">
      {message}
    </div>
  );
}

// MISMO FORMATO DE FECHA Y ZONA HORARIA QUE EL ORIGINAL
function formatEntryDate(
  value: string | null
) {
  if (!value) {
    return "Ahora";
  }

  return new Intl.DateTimeFormat(
    "es-AR",
    {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",

      timeZone:
        "America/Argentina/Buenos_Aires",
    }
  ).format(
    new Date(value)
  );
}
