"use client";

import Link from "next/link";

import {
  FormEvent,
  useState,
} from "react";

type Seller = {
  memberId: string;
  firstName: string;
  lastName: string;
  active: boolean;
};

type Props = {
  event: {
    id: string;
    name: string;
    doorSalesEnabled: boolean;
    doorSalesStartAt: string | null;
    doorSalesEndAt: string | null;
  };

  organizationName: string;

  sellers: Seller[];
};

export default function PuertaPanelClient({
  event,
  organizationName,
  sellers,
}: Props) {
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

  // =====================================================
  // CREAR VENDEDOR
  // =====================================================

  async function createSeller(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/vendedores-puerta",
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
            "No se pudo crear el vendedor."
        );
      }

      window.location.reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo crear el vendedor."
      );
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // ACTIVAR / PAUSAR
  // =====================================================

  async function toggleSeller(
    memberId: string,
    active: boolean
  ) {
    setChangingId(memberId);
    setError("");

    try {
      const response =
        await fetch(
          "/api/vendedores-puerta",
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
            "No se pudo actualizar el vendedor."
        );
      }

      window.location.reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el vendedor."
      );
    } finally {
      setChangingId(null);
    }
  }


  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#050505] text-[#f7f3ed] selection:bg-[#ff3b24] selection:text-white">
      <EditorialBackdrop />

      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#050505]/85 backdrop-blur-2xl">
        <div className="mx-auto flex min-h-[80px] max-w-[1480px] flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4 md:px-8 xl:px-10">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <Link href="/panel" aria-label="Volver al panel" className={BACK_BUTTON}>
              <span aria-hidden="true">←</span>
            </Link>
            <div className="flex min-w-0 items-center gap-3">
              <BrandMark />
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase tracking-[0.24em] text-[#ff7354]">
                  Event control
                </p>
                <p title={event.name} className="mt-1 truncate text-sm font-black uppercase tracking-[-0.02em] text-white/80">
                  {event.name}
                </p>
              </div>
            </div>
          </div>
          <button type="button" onClick={() => setModalOpen(true)} className={PRIMARY_BUTTON + " h-10 shrink-0 gap-2 px-3 sm:gap-3 sm:px-5"}>
            <span aria-hidden="true">+</span>
            Agregar vendedor
          </button>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-[1480px] px-5 py-9 md:px-8 xl:px-10">
        <section className="mb-8 grid gap-7 border-b border-white/[0.07] pb-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-end xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-3 border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.055] px-4 py-2">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#ff3b24] shadow-[0_0_12px_#ff3b24]" />
              <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#ff9272]">
                Gestión de boletería
              </span>
            </div>
            <h1 className="mt-7 max-w-[980px] text-[clamp(44px,6vw,82px)] font-black uppercase leading-[0.84] tracking-[-0.065em]">
              Venta en
              <span className="block bg-gradient-to-r from-[#fff2ea] via-[#ff8c69] to-[#ff2a1a] bg-clip-text text-transparent">
                puerta.
              </span>
            </h1>
          </div>
          <div className="min-w-0 max-w-[420px]">
            <p className="text-sm leading-7 text-white/45">
              Administrá quién puede vender entradas en la puerta del evento.
              Consultá la habilitación de boletería, los horarios y tu equipo.
            </p>
            <p className="mt-4 break-words text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">
              {organizationName} <span aria-hidden="true" className="mx-2 text-[#ff7354]">/</span> Organizador
            </p>
          </div>
        </section>

        {error && <div className="mb-6"><ErrorBox message={error} /></div>}

        {/* ESTADO Y HORARIOS: MISMAS CONDICIONES QUE EL ORIGINAL */}
        <section aria-labelledby="door-status-title" className={PANEL + " relative p-5 md:p-6"}>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,42,26,.055),transparent_52%,rgba(255,90,42,.035))]" />
          <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div className="min-w-0">
              <p className={EYEBROW}>Capital Pass / Boletería</p>
              <h2 id="door-status-title" className="mt-3 text-xl font-black uppercase leading-tight tracking-[-0.025em] sm:text-2xl">
                {event.doorSalesEnabled ? "Venta en puerta habilitada" : "Venta en puerta deshabilitada"}
              </h2>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
                <span className={"inline-flex items-center gap-2 border px-3 py-2 text-[9px] font-black uppercase tracking-[0.13em] " + (event.doorSalesEnabled
                  ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300"
                  : "border-red-400/20 bg-red-400/[0.06] text-red-200")}>
                  <span aria-hidden="true" className={"h-1.5 w-1.5 rounded-full " + (event.doorSalesEnabled ? "bg-emerald-400" : "bg-red-400")} />
                  {event.doorSalesEnabled ? "Habilitada" : "Deshabilitada"}
                </span>
                <p className="text-sm leading-6 text-white/50">
                  {formatWindow(event.doorSalesStartAt, event.doorSalesEndAt)}
                </p>
              </div>
            </div>
            <Link href="/panel/evento" className={SECONDARY_BUTTON + " shrink-0 self-start md:self-auto"}>
              Configurar horarios <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </section>

        <section aria-label="Resumen de vendedores" className="mt-5 grid gap-4 sm:grid-cols-2">
          <Metric title="Vendedores asignados" value={String(sellers.length)} />
          <Metric title="Vendedores activos" value={String(sellers.filter((seller) => seller.active).length)} accent />
        </section>

        <section aria-labelledby="door-sellers-title" className={PANEL + " mt-5"}>
          <div className="border-b border-white/[0.07] p-5 md:p-6">
            <p className={EYEBROW}>Equipo de boletería</p>
            <h2 id="door-sellers-title" className="mt-3 text-xl font-black uppercase tracking-[-0.025em]">
              Vendedores de puerta
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/45">
              Personal habilitado para registrar ventas en boletería.
            </p>
          </div>
          {sellers.length === 0 ? (
            <div className="p-5 md:p-6">
              <div className="border border-dashed border-white/[0.09] bg-white/[0.015] px-5 py-10">
                <p className="text-lg font-black uppercase tracking-[-0.02em]">Tu equipo empieza acá.</p>
                <p className="mt-3 text-sm leading-6 text-white/45">
                  Todavía no agregaste vendedores de puerta.
                  Usá “Agregar vendedor” para crear el primero.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.07]">
              {sellers.map((seller, index) => (
                <article key={seller.memberId} className="flex flex-wrap items-center justify-between gap-4 p-5 transition hover:bg-[#ff3b24]/[0.025] md:p-6">
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <span aria-hidden="true" className="mt-1 shrink-0 text-[9px] font-black tabular-nums tracking-[0.13em] text-[#ff7354]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 border-l border-[#ff5a2a]/20 pl-4">
                      <h3 className="break-words text-base font-black uppercase leading-6 tracking-[-0.02em]">
                        {seller.firstName} {seller.lastName}
                      </h3>
                      <div className="mt-2 flex items-center gap-2">
                        <span aria-hidden="true" className={"h-1.5 w-1.5 shrink-0 rounded-full " + (seller.active ? "bg-emerald-400" : "bg-orange-400")} />
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
                          {seller.active ? "Activo" : "Pausado"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={changingId === seller.memberId}
                    onClick={() => toggleSeller(seller.memberId, !seller.active)}
                    aria-label={(seller.active ? "Pausar a " : "Activar a ") + seller.firstName + " " + seller.lastName}
                    aria-busy={changingId === seller.memberId}
                    className={"inline-flex min-h-[44px] shrink-0 items-center justify-center border px-4 py-3 text-[9px] font-black uppercase tracking-[0.13em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff9272] disabled:cursor-not-allowed disabled:opacity-45 " + (seller.active
                      ? "border-orange-400/20 bg-orange-400/[0.055] text-orange-300 hover:bg-orange-400/[0.10]"
                      : "border-emerald-400/20 bg-emerald-400/[0.055] text-emerald-300 hover:bg-emerald-400/[0.10]")}
                  >
                    {changingId === seller.memberId ? "..." : seller.active ? "Pausar" : "Activar"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* NUEVO VENDEDOR: SCROLL DISPONIBLE EN PANTALLAS PEQUEÑAS */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/80 px-4 py-4 backdrop-blur-sm sm:px-5 sm:py-8">
          <div className="flex min-h-full items-center justify-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-door-seller-title"
              aria-describedby="new-door-seller-description"
              className="my-auto w-full max-w-lg border border-[#ff5a2a]/20 bg-[linear-gradient(145deg,#110e0c,#090807)] p-5 text-[#f7f3ed] shadow-[0_30px_120px_rgba(255,42,26,.12)] sm:p-6"
            >
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className={EYEBROW}>Capital Pass / Boletería</p>
                  <h2 id="new-door-seller-title" className="mt-3 text-2xl font-black uppercase leading-tight tracking-[-0.04em]">
                    Nuevo vendedor
                  </h2>
                  <p id="new-door-seller-description" className="mt-3 break-words text-sm leading-6 text-white/50">
                    Tendrá acceso al panel de venta en puerta de {event.name}.
                  </p>
                </div>
                <button type="button" onClick={() => setModalOpen(false)} aria-label="Cerrar formulario" className={BACK_BUTTON + " text-xl"}>
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <form onSubmit={createSeller} className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nombre" value={firstName} onChange={setFirstName} required />
                  <Field label="Apellido" value={lastName} onChange={setLastName} required />
                </div>
                <Field label="Email" type="email" value={email} onChange={setEmail} required />
                <Field label="Teléfono" value={phone} onChange={setPhone} placeholder="Opcional" />
                <Field label="Contraseña inicial" type="password" value={password} onChange={setPassword} required />
                {error && <ErrorBox message={error} />}
                <button type="submit" disabled={loading} aria-busy={loading} className={PRIMARY_BUTTON + " h-12 w-full px-5"}>
                  {loading ? "Creando..." : "Crear vendedor"}
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
// ESTILO DE LA REFERENCIA: NEGRO, CREMA, CORAL Y BLOQUES RECTOS
// Todas las clases son completas para que Tailwind las detecte.
// =====================================================

const EYEBROW = "text-[9px] font-black uppercase tracking-[0.20em] text-[#ff7958]";
const PANEL = "overflow-hidden border border-white/[0.09] bg-[#0a0908]/90 shadow-[0_25px_80px_rgba(0,0,0,.22),inset_0_1px_0_rgba(255,255,255,.03)] backdrop-blur-xl";
const PRIMARY_BUTTON = "inline-flex items-center justify-center bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] text-[9px] font-black uppercase tracking-[0.14em] text-white shadow-[0_14px_40px_rgba(255,59,36,.16)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff9272] disabled:cursor-not-allowed disabled:opacity-45";
const SECONDARY_BUTTON = "inline-flex min-h-[44px] items-center justify-center gap-3 border border-[#ff5a2a]/25 bg-[#ff3b24]/[0.055] px-4 py-3 text-[9px] font-black uppercase tracking-[0.12em] text-[#ffab94] transition hover:border-[#ff5a2a]/45 hover:bg-[#ff3b24]/[0.09] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff9272]";
const BACK_BUTTON = "flex h-10 w-10 shrink-0 items-center justify-center border border-white/[0.09] bg-white/[0.02] text-white/45 transition hover:border-[#ff5a2a]/30 hover:bg-[#ff3b24]/[0.04] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff9272]";

function EditorialBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -left-[260px] -top-[280px] h-[680px] w-[680px] rounded-full bg-[#ff2a1a]/[0.11] blur-[185px]" />
      <div className="absolute -right-[280px] top-[15%] h-[700px] w-[700px] rounded-full bg-[#ff5a2a]/[0.08] blur-[190px]" />
      <div className="absolute bottom-[-350px] left-[25%] h-[650px] w-[820px] rounded-[50%] bg-[radial-gradient(ellipse_at_top,rgba(255,124,76,.18)_0%,rgba(255,59,36,.09)_25%,rgba(76,14,7,.06)_50%,transparent_72%)] blur-[40px]" />
      <div className="absolute inset-0 opacity-[0.033]">
        <div className="h-full w-full bg-[radial-gradient(circle,white_0.6px,transparent_0.8px)] bg-[size:5px_5px]" />
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

function Metric({
  title,
  value,
  accent = false,
}: {
  title: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={"min-w-0 border p-5 md:p-6 " + (accent
      ? "border-[#ff5a2a]/[0.16] bg-[linear-gradient(135deg,rgba(255,42,26,.055),rgba(10,9,8,.94)_52%,rgba(255,90,42,.035))] shadow-[inset_0_1px_0_rgba(255,255,255,.03)]"
      : "border-white/[0.08] bg-[#0a0908]/90 shadow-[inset_0_1px_0_rgba(255,255,255,.02)]")}>
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/45">{title}</p>
      <p className={"mt-5 text-5xl font-black leading-none tabular-nums tracking-[-0.05em] " + (accent ? "text-[#ffab94]" : "")}>
        {value}
      </p>
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
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/60">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 h-12 w-full border border-white/[0.09] bg-black/25 px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#ff5a2a]/60 focus:ring-1 focus:ring-[#ff5a2a]/30"
      />
    </label>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-sm text-red-200">
      {message}
    </div>
  );
}

// HORARIOS: MISMA FUNCIÓN, FORMATO Y ZONA HORARIA DEL ORIGINAL
function formatWindow(
  start: string | null,
  end: string | null
) {
  if (!start && !end) {
    return "Sin horario específico configurado.";
  }

  const format = (
    value: string
  ) =>
    new Intl.DateTimeFormat(
      "es-AR",
      {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",

        timeZone:
          "America/Argentina/Buenos_Aires",
      }
    ).format(
      new Date(value)
    );

  if (start && end) {
    return `${format(
      start
    )} → ${format(end)}`;
  }

  if (start) {
    return `Habilitada desde ${format(
      start
    )}`;
  }

  return `Disponible hasta ${format(
    end!
  )}`;
}

