"use client";

import Link from "next/link";

import {
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

// =====================================================
// TYPES
// =====================================================

type Province = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
};

type Locality = {
  id: string;
  name: string;

  provinceId: string;
  provinceName: string | null;

  lat: number | null;
  lng: number | null;
};

type LocationSelection = {
  provinceId: string;
  provinceName: string;

  localityId: string;
  localityName: string;

  lat: number | null;
  lng: number | null;

  zone: string;
};

type RRPP = {
  memberId: string;
  eventStaffId: string;

  firstName: string;
  lastName: string;

  active: boolean;

  assignedProvince: string | null;
  assignedProvinceId: string | null;

  assignedCity: string | null;
  assignedLocalityId: string | null;

  assignedZone: string | null;

  assignedLat: number | null;
  assignedLng: number | null;

  locationLabel: string | null;

  commissionPercentage: number;

  salesCount: number;
  ticketsSold: number;

  totalSold: number;

  commissionGenerated: number;
  commissionPaid: number;
  commissionPending: number;
};

type Props = {
  event: {
    id: string;
    name: string;
  };

  organizationName: string;

  rrpps: RRPP[];

  metrics: {
    totalRRPPs: number;
    activeRRPPs: number;

    totalSold: number;

    commissionsGenerated: number;
    commissionsPaid: number;
    commissionsPending: number;
  };
};

type EditData = {
  memberId: string;

  firstName: string;
  lastName: string;

  commissionPercentage: string;

  legacyCity: string | null;
  legacyZone: string | null;
};

type PaymentData = {
  memberId: string;
  name: string;

  generated: number;
  paid: number;
  pending: number;
};

// =====================================================
// EMPTY LOCATION
// =====================================================

const EMPTY_LOCATION: LocationSelection = {
  provinceId: "",
  provinceName: "",

  localityId: "",
  localityName: "",

  lat: null,
  lng: null,

  zone: "",
};

// =====================================================
// COMPONENT
// =====================================================

export default function RRPPsClient({
  event,
  organizationName,
  rrpps,
  metrics,
}: Props) {
  const [createOpen, setCreateOpen] =
    useState(false);

  const [editData, setEditData] =
    useState<EditData | null>(null);

  const [paymentData, setPaymentData] =
    useState<PaymentData | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [changingId, setChangingId] =
    useState<string | null>(null);

  const [error, setError] =
    useState("");

  // =====================================================
  // NUEVO RRPP
  // =====================================================

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

  const [
    commissionPercentage,
    setCommissionPercentage,
  ] = useState("0");

  const [
    createLocation,
    setCreateLocation,
  ] =
    useState<LocationSelection>(
      EMPTY_LOCATION
    );

  // =====================================================
  // EDITAR UBICACIÓN
  // =====================================================

  const [
    editLocation,
    setEditLocation,
  ] =
    useState<LocationSelection>(
      EMPTY_LOCATION
    );

  // =====================================================
  // PAGO
  // =====================================================

  const [
    paymentAmount,
    setPaymentAmount,
  ] = useState("");

  const [
    paymentNote,
    setPaymentNote,
  ] = useState("");

  // =====================================================
  // ABRIR CREAR
  // =====================================================

  function openCreate() {
    setError("");

    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setPassword("");

    setCommissionPercentage(
      "0"
    );

    setCreateLocation({
      ...EMPTY_LOCATION,
    });

    setCreateOpen(true);
  }

  // =====================================================
  // CREAR RRPP
  // =====================================================

  async function createRRPP(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      if (
        createLocation.provinceId &&
        !createLocation.localityId
      ) {
        throw new Error(
          "Seleccioná una ciudad o localidad."
        );
      }

      const response =
        await fetch(
          "/api/rrpps",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              eventId:
                event.id,

              firstName,
              lastName,
              email,
              phone,
              password,

              commissionPercentage,

              assignedProvince:
                createLocation.provinceName ||
                null,

              assignedProvinceId:
                createLocation.provinceId ||
                null,

              assignedCity:
                createLocation.localityName ||
                null,

              assignedLocalityId:
                createLocation.localityId ||
                null,

              assignedZone:
                createLocation.zone ||
                null,

              assignedLat:
                createLocation.lat,

              assignedLng:
                createLocation.lng,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "No se pudo crear el RRPP."
        );
      }

      window.location.reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo crear el RRPP."
      );
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // PAUSAR / ACTIVAR
  // =====================================================

  async function toggleRRPP(
    memberId: string,
    active: boolean
  ) {
    setChangingId(
      memberId
    );

    setError("");

    try {
      const response =
        await fetch(
          "/api/rrpps",
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              eventId:
                event.id,

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
            "No se pudo actualizar el RRPP."
        );
      }

      window.location.reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el RRPP."
      );
    } finally {
      setChangingId(
        null
      );
    }
  }

  // =====================================================
  // ABRIR EDITAR
  // =====================================================

  function openEdit(
    rrpp: RRPP
  ) {
    setError("");

    setEditData({
      memberId:
        rrpp.memberId,

      firstName:
        rrpp.firstName,

      lastName:
        rrpp.lastName,

      commissionPercentage:
        String(
          rrpp.commissionPercentage
        ),

      legacyCity:
        rrpp.assignedCity,

      legacyZone:
        rrpp.assignedZone,
    });

    setEditLocation({
      provinceId:
        rrpp.assignedProvinceId ??
        "",

      provinceName:
        rrpp.assignedProvince ??
        "",

      localityId:
        rrpp.assignedLocalityId ??
        "",

      localityName:
        rrpp.assignedCity ??
        "",

      lat:
        rrpp.assignedLat,

      lng:
        rrpp.assignedLng,

      zone:
        rrpp.assignedZone ??
        "",
    });
  }

  // =====================================================
  // EDITAR RRPP
  // =====================================================

  async function updateRRPP(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (!editData) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload: Record<
        string,
        unknown
      > = {
        eventId:
          event.id,

        memberId:
          editData.memberId,

        commissionPercentage:
          editData.commissionPercentage,
      };

      /*
       * Solamente enviamos la nueva
       * ubicación oficial cuando el
       * organizador seleccionó
       * Provincia + Localidad.
       *
       * Esto permite que RRPPs viejos
       * sigan funcionando hasta que
       * normalicemos su ubicación.
       */
      if (
        editLocation.provinceId &&
        editLocation.localityId
      ) {
        payload.assignedProvince =
          editLocation.provinceName;

        payload.assignedProvinceId =
          editLocation.provinceId;

        payload.assignedCity =
          editLocation.localityName;

        payload.assignedLocalityId =
          editLocation.localityId;

        payload.assignedZone =
          editLocation.zone ||
          null;

        payload.assignedLat =
          editLocation.lat;

        payload.assignedLng =
          editLocation.lng;
      } else if (
        editData.legacyCity &&
        editLocation.zone !==
          (
            editData.legacyZone ??
            ""
          )
      ) {
        /*
         * Si todavía es una ubicación
         * vieja y solo se modificó la
         * zona, podemos guardar la zona
         * sin obligar a perder el dato.
         */
        payload.assignedZone =
          editLocation.zone ||
          null;
      }

      const response =
        await fetch(
          "/api/rrpps",
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                payload
              ),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "No se pudo guardar la configuración."
        );
      }

      window.location.reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar la configuración."
      );
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // REGISTRAR PAGO
  // =====================================================

  async function registerPayment(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (!paymentData) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const amount =
        Number(
          paymentAmount
            .replace(/\./g, "")
            .replace(",", ".")
        );

      if (
        !Number.isFinite(
          amount
        ) ||
        amount <= 0
      ) {
        throw new Error(
          "Ingresá un importe válido."
        );
      }

      if (
        amount >
        paymentData.pending
      ) {
        throw new Error(
          "El pago no puede superar la comisión pendiente."
        );
      }

      const response =
        await fetch(
          "/api/rrpps",
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              action:
                "payment",

              eventId:
                event.id,

              memberId:
                paymentData.memberId,

              amountMinor:
                Math.round(
                  amount
                ),

              note:
                paymentNote,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "No se pudo registrar el pago."
        );
      }

      window.location.reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo registrar el pago."
      );
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // ABRIR PAGO
  // =====================================================

  function openPayment(
    rrpp: RRPP
  ) {
    setError("");

    setPaymentAmount(
      rrpp.commissionPending >
        0
        ? String(
            rrpp.commissionPending
          )
        : ""
    );

    setPaymentNote("");

    setPaymentData({
      memberId:
        rrpp.memberId,

      name:
        `${rrpp.firstName} ${rrpp.lastName}`,

      generated:
        rrpp.commissionGenerated,

      paid:
        rrpp.commissionPaid,

      pending:
        rrpp.commissionPending,
    });
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <main className="min-h-screen bg-[#050505] text-[#f5f5f5] selection:bg-[#ff3b24] selection:text-white">

      <div className="flex min-h-screen">

        {/* =================================================
            SIDEBAR
        ================================================= */}

        <aside className="hidden w-[255px] shrink-0 border-r border-white/[0.07] bg-[#080706]">

          <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_35%_0%,rgba(255,59,36,0.18),transparent_64%)]" />

          <div className="relative border-b border-white/[0.07] px-6 py-6">

            <Link
              href="/panel"
              className="flex items-center gap-3"
            >
              <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] font-black shadow-[0_10px_35px_rgba(255,42,26,.28)] before:absolute before:inset-x-1 before:top-1 before:h-1/2 before:rounded-xl before:bg-gradient-to-b before:from-white/35 before:to-transparent">
                CP
              </div>

              <div>
                <p className="font-semibold">
                  Capital Pass
                </p>

                <p className="text-xs text-white/30">
                  Event Management
                </p>
              </div>
            </Link>

          </div>

          <nav className="relative flex-1 space-y-1.5 px-3 py-5">

            <Menu
              label="Inicio"
              href="/panel"
            />

            <Menu
              label="Mis eventos"
              href="/panel/evento"
            />

            <Menu
              label="RRPPs"
              href="/panel/rrpps"
              active
            />

            <Menu
              label="Ventas"
              href="/panel?section=ventas"
            />

            <Menu
              label="Venta en puerta"
              href="/panel/puerta"
            />

            <Menu
              label="Ingresos"
              href="/panel?section=ingresos"
            />

            <Menu
              label="Notificaciones"
              href="/panel?section=notificaciones"
            />

            <Menu
              label="Informes"
              href="/panel/informes"
            />

          </nav>

          <div className="relative border-t border-white/[0.07] p-4">

            <div className="rounded-2xl border border-[#ff5a2a]/10 bg-gradient-to-br from-white/[0.045] to-[#ff3b24]/[0.025] p-4">

              <p className="text-sm font-medium">
                {organizationName}
              </p>

              <p className="mt-1 text-xs text-white/30">
                Organizador
              </p>

            </div>

          </div>

        </aside>

        {/* =================================================
            CONTENIDO
        ================================================= */}

        <section className="relative min-w-0 flex-1 overflow-hidden bg-[#050505]">

          <div className="pointer-events-none absolute inset-0 overflow-hidden">

            <div className="absolute right-[-160px] top-[-190px] h-[560px] w-[560px] rounded-full bg-[#ff2a1a]/20 blur-[150px]" />

            <div className="absolute bottom-[-250px] left-[10%] h-[540px] w-[540px] rounded-full bg-[#ff5a2a]/[0.09] blur-[155px]" />

            <div className="absolute left-[42%] top-[180px] h-[360px] w-[360px] rounded-full bg-[#ff3b24]/[0.07] blur-[135px]" />

            <div className="absolute inset-0 opacity-[0.033]">
              <div className="h-full w-full bg-[radial-gradient(circle,white_0.6px,transparent_0.8px)] bg-[size:5px_5px]" />
            </div>

          </div>

          {/* =================================================
              HEADER
          ================================================= */}

          <header className="relative z-20 border-b border-white/[0.07] bg-[#050505]/85 backdrop-blur-2xl">

            <div className="mx-auto flex h-[80px] max-w-[1480px] items-center justify-between px-5 md:px-8 xl:px-10">

            <div className="flex items-center gap-4">

              <Link
                href="/panel"
                className="flex h-10 w-10 items-center justify-center border border-white/[0.09] bg-white/[0.02] text-white/45 transition hover:border-[#ff5a2a]/30 hover:bg-[#ff3b24]/[0.04] hover:text-white"
              >
                ←
              </Link>

              <div className="flex items-center gap-3">
                <div className="relative hidden h-9 w-9 overflow-hidden sm:block">
                  <div className="absolute inset-[5px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_22px_rgba(255,59,36,.2)]" />
                  <div className="absolute inset-[7px] rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.6),transparent_35%)]" />
                </div>

                <div>

                  <p className="text-[8px] font-black uppercase tracking-[0.24em] text-[#ff7354]">
                    Event manager
                  </p>

                  <h1 className="mt-1 max-w-[55vw] truncate text-sm font-black uppercase tracking-[-0.02em] text-white/80">
                    {event.name}
                  </h1>

                </div>
              </div>

            </div>

            <button
              type="button"
              onClick={
                openCreate
              }
              className="inline-flex h-10 items-center justify-center bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] px-5 text-[9px] font-black uppercase tracking-[0.15em] text-white shadow-[0_14px_40px_rgba(255,59,36,.16)] transition hover:brightness-110"
            >
              + Agregar RRPP
            </button>

            </div>
          </header>

          {/* =================================================
              BODY
          ================================================= */}

          <div className="relative z-10 mx-auto max-w-[1480px] px-5 py-9 md:px-8 xl:px-10">

            <section className="mb-8 grid gap-7 border-b border-white/[0.07] pb-9 lg:grid-cols-[1fr_auto] lg:items-end">

              <div>

                <div className="inline-flex items-center gap-3 border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.055] px-4 py-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ff3b24] shadow-[0_0_12px_#ff3b24]" />
                  <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#ff9272]">
                    Equipo comercial
                  </span>
                </div>

                <h2 className="mt-7 max-w-[980px] text-[clamp(44px,6vw,82px)] font-black uppercase leading-[0.84] tracking-[-0.065em]">
                  GESTIONÁ TU
                  <span className="block bg-gradient-to-r from-[#fff2ea] via-[#ff8c69] to-[#ff2a1a] bg-clip-text text-transparent">
                    EQUIPO RRPP.
                  </span>
                </h2>

              </div>

              <p className="max-w-[420px] text-sm leading-7 text-white/35">
                Administrá vendedores,
                zonas, comisiones y
                liquidaciones del evento.
              </p>

            </section>

            {error && (
              <div className="mt-5 border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* =================================================
                MÉTRICAS
            ================================================= */}

            <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

              <Metric
                title="RRPPs"
                value={String(
                  metrics.totalRRPPs
                )}
                detail={`${metrics.activeRRPPs} activos`}
              />

              <Metric
                title="Vendido por RRPP"
                value={formatMoney(
                  metrics.totalSold
                )}
                detail="facturación del canal"
              />

              <Metric
                title="Comisiones"
                value={formatMoney(
                  metrics.commissionsGenerated
                )}
                detail="generadas"
                accent
              />

              <Metric
                title="Pendiente de pago"
                value={formatMoney(
                  metrics.commissionsPending
                )}
                detail={`${formatMoney(
                  metrics.commissionsPaid
                )} ya pagados`}
                warning={
                  metrics.commissionsPending >
                  0
                }
              />

            </section>

            {/* =================================================
                LISTADO
            ================================================= */}

            <section className="mt-5 overflow-hidden border border-white/[0.09] bg-[#0a0908]/90 shadow-[0_25px_80px_rgba(0,0,0,.22),inset_0_1px_0_rgba(255,255,255,.03)] backdrop-blur-xl">

              <div className="border-b border-white/[0.07] px-6 py-5">

                <h3 className="font-semibold">
                  Vendedores
                </h3>

                <p className="mt-1 text-xs text-white/30">
                  Rendimiento,
                  territorio y
                  liquidación individual.
                </p>

              </div>

              {rrpps.length === 0 ? (

                <div className="p-8 text-sm text-white/35">
                  Todavía no hay RRPPs
                  asignados.
                </div>

              ) : (

                <div className="divide-y divide-white/[0.07]">

                  {rrpps.map(
                    (rrpp) => (

                      <article
                        key={
                          rrpp.memberId
                        }
                        className="p-5 transition hover:bg-[#ff3b24]/[0.025] md:p-6"
                      >

                        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">

                          <div className="flex items-start gap-4">

                            <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-[#ff5a2a]/25 bg-gradient-to-br from-[#ff2a1a]/25 via-[#ff3b24]/15 to-[#ff5a2a]/10 text-sm font-black text-[#ffd3c5] shadow-[inset_0_1px_0_rgba(255,255,255,.08)]">
                              {getInitials(
                                rrpp.firstName,
                                rrpp.lastName
                              )}
                            </div>

                            <div>

                              <div className="flex flex-wrap items-center gap-2">

                                <h4 className="font-semibold">
                                  {
                                    rrpp.firstName
                                  }{" "}
                                  {
                                    rrpp.lastName
                                  }
                                </h4>

                                <span
                                  className={`rounded-full px-2.5 py-1 text-[11px] ${
                                    rrpp.active
                                      ? "border border-emerald-400/15 bg-emerald-400/[0.08] text-emerald-300"
                                      : "border border-orange-400/15 bg-orange-400/[0.08] text-orange-300"
                                  }`}
                                >
                                  {rrpp.active
                                    ? "Activo"
                                    : "Pausado"}
                                </span>

                                <span className="rounded-full border border-[#ff5a2a]/15 bg-[#ff5a2a]/[0.07] px-2.5 py-1 text-[11px] text-[#ff9a7d]">
                                  {
                                    rrpp.commissionPercentage
                                  }
                                  % comisión
                                </span>

                              </div>

                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/35">

                                <span>
                                  📍{" "}
                                  {formatLocation(
                                    rrpp
                                  )}
                                </span>

                                <span>
                                  {
                                    rrpp.ticketsSold
                                  }{" "}
                                  entrada
                                  {rrpp.ticketsSold !==
                                  1
                                    ? "s"
                                    : ""}
                                </span>

                                <span>
                                  {
                                    rrpp.salesCount
                                  }{" "}
                                  operación
                                  {rrpp.salesCount !==
                                  1
                                    ? "es"
                                    : ""}
                                </span>

                              </div>

                            </div>

                          </div>

                          <div className="flex flex-wrap gap-2">

                            <button
                              type="button"
                              onClick={() =>
                                openEdit(
                                  rrpp
                                )
                              }
                              className="inline-flex h-10 items-center justify-center border border-white/[0.09] bg-white/[0.02] px-4 text-[9px] font-black uppercase tracking-[0.13em] text-white/65 transition hover:border-[#ff5a2a]/30 hover:text-white"
                            >
                              Editar
                            </button>

                            <button
                              type="button"
                              disabled={
                                changingId ===
                                rrpp.memberId
                              }
                              onClick={() =>
                                toggleRRPP(
                                  rrpp.memberId,
                                  !rrpp.active
                                )
                              }
                              className={`inline-flex h-10 items-center justify-center border px-4 text-[9px] font-black uppercase tracking-[0.13em] transition disabled:opacity-40 ${
                                rrpp.active
                                  ? "border-orange-400/20 bg-orange-400/[0.07] text-orange-300 hover:bg-orange-400/[0.12]"
                                  : "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300 hover:bg-emerald-400/[0.12]"
                              }`}
                            >
                              {changingId ===
                              rrpp.memberId
                                ? "..."
                                : rrpp.active
                                  ? "Pausar"
                                  : "Activar"}
                            </button>

                          </div>

                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">

                          <SmallMetric
                            title="Vendido"
                            value={formatMoney(
                              rrpp.totalSold
                            )}
                          />

                          <SmallMetric
                            title="Comisión"
                            value={`${rrpp.commissionPercentage}%`}
                          />

                          <SmallMetric
                            title="Generado"
                            value={formatMoney(
                              rrpp.commissionGenerated
                            )}
                            accent
                          />

                          <SmallMetric
                            title="Pagado"
                            value={formatMoney(
                              rrpp.commissionPaid
                            )}
                            success={
                              rrpp.commissionPaid >
                              0
                            }
                          />

                          <div
                            className={`border p-4 ${
                              rrpp.commissionPending >
                              0
                                ? "border-amber-400/15 bg-amber-400/[0.045]"
                                : "border-emerald-400/15 bg-emerald-400/[0.04]"
                            }`}
                          >

                            <p className="text-[10px] uppercase tracking-[0.12em] text-white/30">
                              Pendiente
                            </p>

                            <p
                              className={`mt-2 text-lg font-semibold ${
                                rrpp.commissionPending >
                                0
                                  ? "text-amber-300"
                                  : "text-emerald-300"
                              }`}
                            >
                              {formatMoney(
                                rrpp.commissionPending
                              )}
                            </p>

                            {rrpp.commissionPending >
                            0 ? (

                              <button
                                type="button"
                                onClick={() =>
                                  openPayment(
                                    rrpp
                                  )
                                }
                                className="mt-3 text-xs font-medium text-[#ff9a7d] transition hover:text-[#ffc0ad]"
                              >
                                Registrar pago →
                              </button>

                            ) : (

                              <p className="mt-3 text-xs text-emerald-400/70">
                                Al día
                              </p>

                            )}

                          </div>

                        </div>

                      </article>

                    )
                  )}

                </div>
              )}

            </section>

          </div>

        </section>

      </div>

      {/* =================================================
          MODAL CREAR
      ================================================= */}

      {createOpen && (

        <ModalOverlay>

          <ModalCard>

            <ModalHeader
              eyebrow="Nuevo vendedor"
              title="Agregar RRPP"
              description={`Se creará la cuenta y quedará asignada a ${event.name}.`}
              onClose={() =>
                setCreateOpen(
                  false
                )
              }
            />

            <form
              onSubmit={
                createRRPP
              }
              className="mt-6 space-y-4"
            >

              <div className="grid gap-4 sm:grid-cols-2">

                <Field
                  label="Nombre"
                  value={firstName}
                  onChange={
                    setFirstName
                  }
                  required
                />

                <Field
                  label="Apellido"
                  value={lastName}
                  onChange={
                    setLastName
                  }
                  required
                />

              </div>

              <Field
                label="Email"
                type="email"
                value={email}
                onChange={
                  setEmail
                }
                required
              />

              <Field
                label="WhatsApp"
                value={phone}
                onChange={
                  setPhone
                }
                placeholder="Opcional"
              />

              <Field
                label="Contraseña inicial"
                type="password"
                value={password}
                onChange={
                  setPassword
                }
                required
              />

              <div className="my-5 border-t border-white/[0.07]" />

              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ff6040]/70">
                Territorio asignado
              </p>

              <LocationPicker
                value={
                  createLocation
                }
                onChange={
                  setCreateLocation
                }
              />

              <Field
                label="Comisión (%)"
                type="number"
                value={
                  commissionPercentage
                }
                onChange={
                  setCommissionPercentage
                }
                placeholder="10"
                min="0"
                max="100"
                step="0.01"
                required
              />

              {error && (
                <ErrorBox>
                  {error}
                </ErrorBox>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 inline-flex h-12 w-full items-center justify-center bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] text-[9px] font-black uppercase tracking-[0.14em] text-white transition hover:brightness-110 disabled:opacity-40"
              >
                <span className="glow-btn-content">
                  {loading
                    ? "Creando..."
                    : "Crear RRPP"}
                </span>
              </button>

            </form>

          </ModalCard>

        </ModalOverlay>

      )}

      {/* =================================================
          MODAL EDITAR
      ================================================= */}

      {editData && (

        <ModalOverlay>

          <ModalCard>

            <ModalHeader
              eyebrow="Configuración RRPP"
              title={`${editData.firstName} ${editData.lastName}`}
              description="Definí su territorio y porcentaje de comisión para este evento."
              onClose={() =>
                setEditData(
                  null
                )
              }
            />

            <form
              onSubmit={
                updateRRPP
              }
              className="mt-6 space-y-4"
            >

              {editData.legacyCity &&
                !editLocation.provinceId && (
                  <div className="border border-amber-400/15 bg-amber-400/[0.05] p-4">

                    <p className="text-xs font-medium text-amber-200">
                      Ubicación anterior
                    </p>

                    <p className="mt-2 text-sm text-white/50">
                      {editData.legacyCity}

                      {editData.legacyZone
                        ? ` · ${editData.legacyZone}`
                        : ""}
                    </p>

                    <p className="mt-2 text-xs leading-5 text-white/30">
                      Esta ubicación fue
                      cargada antes del
                      nuevo buscador. Elegí
                      Provincia y Localidad
                      debajo para
                      normalizarla.
                    </p>

                  </div>
                )}

              <LocationPicker
                value={
                  editLocation
                }
                onChange={
                  setEditLocation
                }
              />

              <Field
                label="Comisión (%)"
                type="number"
                value={
                  editData.commissionPercentage
                }
                onChange={(
                  value
                ) =>
                  setEditData({
                    ...editData,
                    commissionPercentage:
                      value,
                  })
                }
                min="0"
                max="100"
                step="0.01"
                required
              />

              <div className="border border-[#ff5a2a]/10 bg-[#ff5a2a]/[0.04] p-4">

                <p className="text-xs leading-5 text-white/40">
                  La zona y comisión quedan
                  asociadas únicamente a{" "}
                  <strong className="font-medium text-white/70">
                    {event.name}
                  </strong>
                  .
                </p>

              </div>

              {error && (
                <ErrorBox>
                  {error}
                </ErrorBox>
              )}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-12 w-full items-center justify-center bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] text-[9px] font-black uppercase tracking-[0.14em] text-white transition hover:brightness-110 disabled:opacity-40"
              >
                <span className="glow-btn-content">
                  {loading
                    ? "Guardando..."
                    : "Guardar cambios"}
                </span>
              </button>

            </form>

          </ModalCard>

        </ModalOverlay>

      )}

      {/* =================================================
          MODAL PAGO
      ================================================= */}

      {paymentData && (

        <ModalOverlay>

          <ModalCard>

            <ModalHeader
              eyebrow="Liquidación"
              title={paymentData.name}
              description="Registrá un pago realizado al RRPP."
              onClose={() =>
                setPaymentData(
                  null
                )
              }
            />

            <div className="mt-6 grid grid-cols-3 gap-3">

              <PaymentMetric
                label="Generado"
                value={formatMoney(
                  paymentData.generated
                )}
              />

              <PaymentMetric
                label="Pagado"
                value={formatMoney(
                  paymentData.paid
                )}
              />

              <PaymentMetric
                label="Pendiente"
                value={formatMoney(
                  paymentData.pending
                )}
                accent
              />

            </div>

            <form
              onSubmit={
                registerPayment
              }
              className="mt-5 space-y-4"
            >

              <Field
                label="Importe a pagar"
                type="number"
                value={
                  paymentAmount
                }
                onChange={
                  setPaymentAmount
                }
                min="1"
                max={String(
                  paymentData.pending
                )}
                step="1"
                required
              />

              <Field
                label="Nota"
                value={
                  paymentNote
                }
                onChange={
                  setPaymentNote
                }
                placeholder="Ej. Pago en efectivo"
              />

              <button
                type="button"
                onClick={() =>
                  setPaymentAmount(
                    String(
                      paymentData.pending
                    )
                  )
                }
                className="text-xs text-[#ff9a7d] transition hover:text-[#ffc0ad]"
              >
                Usar total pendiente:{" "}
                {formatMoney(
                  paymentData.pending
                )}
              </button>

              {error && (
                <ErrorBox>
                  {error}
                </ErrorBox>
              )}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-12 w-full items-center justify-center bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] text-[9px] font-black uppercase tracking-[0.14em] text-white transition hover:brightness-110 disabled:opacity-40"
              >
                <span className="glow-btn-content">
                  {loading
                    ? "Registrando..."
                    : "Registrar pago"}
                </span>
              </button>

            </form>

          </ModalCard>

        </ModalOverlay>

      )}

    </main>
  );
}

// =====================================================
// LOCATION PICKER
// =====================================================

function LocationPicker({
  value,
  onChange,
}: {
  value: LocationSelection;

  onChange: (
    value: LocationSelection
  ) => void;
}) {
  const [
    provinces,
    setProvinces,
  ] =
    useState<Province[]>(
      []
    );

  const [
    provinceQuery,
    setProvinceQuery,
  ] = useState(
    value.provinceName
  );

  const [
    provinceOpen,
    setProvinceOpen,
  ] = useState(false);

  const [
    localityQuery,
    setLocalityQuery,
  ] = useState(
    value.localityName
  );

  const [
    localities,
    setLocalities,
  ] =
    useState<Locality[]>(
      []
    );

  const [
    localityOpen,
    setLocalityOpen,
  ] = useState(false);

  const [
    loadingProvinces,
    setLoadingProvinces,
  ] = useState(false);

  const [
    loadingLocalities,
    setLoadingLocalities,
  ] = useState(false);

  // ===================================================
  // SINCRONIZAR
  // ===================================================

  useEffect(() => {
    setProvinceQuery(
      value.provinceName
    );
  }, [
    value.provinceName,
  ]);

  useEffect(() => {
    setLocalityQuery(
      value.localityName
    );
  }, [
    value.localityName,
  ]);

  // ===================================================
  // PROVINCIAS
  // ===================================================

  useEffect(() => {
    let cancelled =
      false;

    async function load() {
      setLoadingProvinces(
        true
      );

      try {
        const response =
          await fetch(
            "/api/ubicaciones?tipo=provincias"
          );

        const data =
          await response.json();

        if (
          !cancelled &&
          response.ok
        ) {
          setProvinces(
            data.provinces ??
              []
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingProvinces(
            false
          );
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  // ===================================================
  // LOCALIDADES
  // ===================================================

  useEffect(() => {
    let cancelled =
      false;

    if (
      !value.provinceId ||
      localityQuery.trim()
        .length < 2 ||
      (
        value.localityId &&
        localityQuery ===
          value.localityName
      )
    ) {
      setLocalities(
        []
      );

      setLoadingLocalities(
        false
      );

      return;
    }

    const timer =
      window.setTimeout(
        async () => {
          setLoadingLocalities(
            true
          );

          try {
            const params =
              new URLSearchParams({
                tipo:
                  "localidades",

                provinciaId:
                  value.provinceId,

                q:
                  localityQuery.trim(),
              });

            const response =
              await fetch(
                `/api/ubicaciones?${params.toString()}`
              );

            const data =
              await response.json();

            if (
              !cancelled &&
              response.ok
            ) {
              setLocalities(
                data.localities ??
                  []
              );

              setLocalityOpen(
                true
              );
            }
          } finally {
            if (!cancelled) {
              setLoadingLocalities(
                false
              );
            }
          }
        },
        250
      );

    return () => {
      cancelled = true;

      window.clearTimeout(
        timer
      );
    };
  }, [
    localityQuery,
    value.provinceId,
    value.localityId,
    value.localityName,
  ]);

  // ===================================================
  // FILTRAR PROVINCIAS
  // ===================================================

  const filteredProvinces =
    useMemo(() => {
      const query =
        normalizeText(
          provinceQuery
        );

      if (!query) {
        return provinces;
      }

      return provinces.filter(
        (province) =>
          normalizeText(
            province.name
          ).includes(
            query
          )
      );
    }, [
      provinces,
      provinceQuery,
    ]);

  // ===================================================
  // SELECT PROVINCIA
  // ===================================================

  function selectProvince(
    province: Province
  ) {
    setProvinceQuery(
      province.name
    );

    setProvinceOpen(
      false
    );

    setLocalityQuery(
      ""
    );

    setLocalities(
      []
    );

    onChange({
      provinceId:
        province.id,

      provinceName:
        province.name,

      localityId:
        "",

      localityName:
        "",

      lat:
        null,

      lng:
        null,

      zone:
        value.zone,
    });
  }

  // ===================================================
  // SELECT LOCALIDAD
  // ===================================================

  function selectLocality(
    locality: Locality
  ) {
    setLocalityQuery(
      locality.name
    );

    setLocalityOpen(
      false
    );

    onChange({
      ...value,

      localityId:
        locality.id,

      localityName:
        locality.name,

      lat:
        locality.lat,

      lng:
        locality.lng,
    });
  }

  return (
    <div className="space-y-4">

      {/* =================================================
          PROVINCIA
      ================================================= */}

      <div className="relative">

        <label className="block">

          <span className="text-xs text-white/35">
            Provincia
          </span>

          <div className="relative mt-2">

            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-white/25">
              ⌕
            </span>

            <input
              type="text"
              value={
                provinceQuery
              }
              placeholder="Buscar provincia..."
              onFocus={() =>
                setProvinceOpen(
                  true
                )
              }
              onChange={(e) => {
                const next =
                  e.target.value;

                setProvinceQuery(
                  next
                );

                setProvinceOpen(
                  true
                );

                /*
                 * Si el usuario modifica
                 * manualmente el texto,
                 * deja de ser una
                 * selección oficial.
                 */
                if (
                  next !==
                  value.provinceName
                ) {
                  onChange({
                    ...value,

                    provinceId:
                      "",

                    provinceName:
                      "",

                    localityId:
                      "",

                    localityName:
                      "",

                    lat:
                      null,

                    lng:
                      null,
                  });

                  setLocalityQuery(
                    ""
                  );
                }
              }}
              className="h-12 w-full border border-white/[0.09] bg-black/25 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/45"
            />

          </div>

        </label>

        {provinceOpen && (
          <div className="absolute left-0 right-0 top-[74px] z-[300] max-h-56 overflow-y-auto border border-[#ff5a2a]/15 bg-[#110e0c] p-2 shadow-[0_25px_70px_rgba(0,0,0,.72)]">

            {loadingProvinces ? (

              <p className="px-3 py-3 text-xs text-white/35">
                Cargando provincias...
              </p>

            ) : filteredProvinces.length ===
              0 ? (

              <p className="px-3 py-3 text-xs text-white/35">
                No encontramos esa provincia.
              </p>

            ) : (

              filteredProvinces.map(
                (province) => (

                  <button
                    key={
                      province.id
                    }
                    type="button"
                    onClick={() =>
                      selectProvince(
                        province
                      )
                    }
                    className="flex w-full items-center justify-between px-3 py-3 text-left text-sm transition hover:bg-[#ff3b24]/[0.08]"
                  >

                    <span>
                      {province.name}
                    </span>

                    {value.provinceId ===
                      province.id && (
                      <span className="text-[#ff9a7d]">
                        ✓
                      </span>
                    )}

                  </button>

                )
              )

            )}

          </div>
        )}

      </div>

      {/* =================================================
          LOCALIDAD
      ================================================= */}

      <div className="relative">

        <label className="block">

          <span className="text-xs text-white/35">
            Ciudad / localidad
          </span>

          <div className="relative mt-2">

            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-white/25">
              ⌕
            </span>

            <input
              type="text"
              disabled={
                !value.provinceId
              }
              value={
                localityQuery
              }
              placeholder={
                value.provinceId
                  ? "Ej. Ros..."
                  : "Primero elegí una provincia"
              }
              onFocus={() => {
                if (
                  localities.length >
                  0
                ) {
                  setLocalityOpen(
                    true
                  );
                }
              }}
              onChange={(e) => {
                const next =
                  e.target.value;

                setLocalityQuery(
                  next
                );

                if (
                  next !==
                  value.localityName
                ) {
                  onChange({
                    ...value,

                    localityId:
                      "",

                    localityName:
                      "",

                    lat:
                      null,

                    lng:
                      null,
                  });
                }
              }}
              className="h-12 w-full border border-white/[0.09] bg-black/25 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/45 disabled:cursor-not-allowed disabled:opacity-40"
            />

            {loadingLocalities && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] text-[#ff9a7d]">
                buscando...
              </span>
            )}

          </div>

        </label>

        {localityOpen &&
          value.provinceId &&
          localityQuery.trim()
            .length >= 2 && (
            <div className="absolute left-0 right-0 top-[74px] z-[300] max-h-60 overflow-y-auto border border-[#ff5a2a]/15 bg-[#110e0c] p-2 shadow-[0_25px_70px_rgba(0,0,0,.72)]">

              {localities.length ===
              0 ? (

                <p className="px-3 py-3 text-xs text-white/35">
                  No encontramos localidades.
                </p>

              ) : (

                localities.map(
                  (locality) => (

                    <button
                      key={
                        locality.id
                      }
                      type="button"
                      onClick={() =>
                        selectLocality(
                          locality
                        )
                      }
                      className="flex w-full items-center justify-between px-3 py-3 text-left transition hover:bg-[#ff3b24]/[0.08]"
                    >

                      <div>

                        <p className="text-sm text-white">
                          {
                            locality.name
                          }
                        </p>

                        <p className="mt-1 text-[11px] text-white/30">
                          {
                            locality.provinceName
                          }
                        </p>

                      </div>

                      <span className="text-xs text-[#ff9a7d]">
                        Seleccionar
                      </span>

                    </button>

                  )
                )

              )}

            </div>
          )}

      </div>

      {/* =================================================
          SELECCIÓN CONFIRMADA
      ================================================= */}

      {value.provinceId &&
        value.localityId && (
          <div className="border border-[#ff5a2a]/15 bg-[#ff3b24]/[0.045] px-4 py-3">

            <p className="text-[10px] uppercase tracking-[0.13em] text-[#ff9a7d]/70">
              Ubicación seleccionada
            </p>

            <p className="mt-1 text-sm font-medium">
              {value.localityName}
              {" · "}
              {value.provinceName}
            </p>

          </div>
        )}

      {/* =================================================
          ZONA
      ================================================= */}

      <Field
        label="Zona / barrio"
        value={
          value.zone
        }
        onChange={(zone) =>
          onChange({
            ...value,
            zone,
          })
        }
        placeholder="Ej. Centro, Pichincha, Zona Norte..."
      />

    </div>
  );
}

// =====================================================
// MENU
// =====================================================

function Menu({
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
          ? "border-[#ff5a2a]/20 bg-[#ff3b24]/[0.10] text-white"
          : "border-transparent text-white/35 hover:bg-white/[0.035] hover:text-white/70"
      }`}
    >

      <span
        className={`h-1.5 w-1.5 rounded-full ${
          active
            ? "bg-[#ff3b24] shadow-[0_0_12px_rgba(255,59,36,.85)]"
            : "bg-white/20"
        }`}
      />

      {label}

    </Link>
  );
}

// =====================================================
// METRIC
// =====================================================

function Metric({
  title,
  value,
  detail,
  accent = false,
  warning = false,
}: {
  title: string;
  value: string;
  detail: string;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={`border p-5 ${
        warning
          ? "border-amber-400/15 bg-amber-400/[0.035]"
          : accent
          ? "border-[#ff5a2a]/[0.16] bg-[linear-gradient(135deg,rgba(255,42,26,.08),rgba(10,9,8,.94)_60%,rgba(255,90,42,.035))] shadow-[inset_0_1px_0_rgba(255,255,255,.03)]"
          : "border-white/[0.08] bg-[#0a0908]/90 shadow-[inset_0_1px_0_rgba(255,255,255,.02)]"
      }`}
    >

      <p className="text-xs uppercase tracking-[0.12em] text-white/30">
        {title}
      </p>

      <p
        className={`mt-5 text-3xl font-semibold ${
          warning
            ? "text-amber-200"
            : accent
              ? "text-[#ffd3c5]"
              : ""
        }`}
      >
        {value}
      </p>

      <p className="mt-2 text-xs text-white/30">
        {detail}
      </p>

    </div>
  );
}

// =====================================================
// SMALL METRIC
// =====================================================

function SmallMetric({
  title,
  value,
  accent = false,
  success = false,
}: {
  title: string;
  value: string;
  accent?: boolean;
  success?: boolean;
}) {
  return (
    <div
      className={`border p-4 ${
        accent
          ? "border-[#ff5a2a]/15 bg-[#ff5a2a]/[0.045]"
          : success
            ? "border-emerald-400/15 bg-emerald-400/[0.04]"
            : "border-white/[0.07] bg-white/[0.025]"
      }`}
    >

      <p className="text-[10px] uppercase tracking-[0.12em] text-white/30">
        {title}
      </p>

      <p
        className={`mt-2 text-lg font-semibold ${
          accent
            ? "text-[#ffc0ad]"
            : success
              ? "text-emerald-300"
              : ""
        }`}
      >
        {value}
      </p>

    </div>
  );
}

// =====================================================
// MODAL
// =====================================================

function ModalOverlay({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/80 px-5 py-8 backdrop-blur-sm">
      {children}
    </div>
  );
}

function ModalCard({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="my-auto w-full max-w-xl border border-[#ff5a2a]/20 bg-[linear-gradient(145deg,#110e0c,#090807)] p-6 shadow-[0_30px_120px_rgba(255,42,26,.16)]">
      {children}
    </div>
  );
}

function ModalHeader({
  eyebrow,
  title,
  description,
  onClose,
}: {
  eyebrow: string;
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-5">

      <div>

        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ff6040]">
          {eyebrow}
        </p>

        <h2 className="mt-2 text-2xl font-semibold">
          {title}
        </h2>

        <p className="mt-2 text-sm leading-6 text-white/35">
          {description}
        </p>

      </div>

      <button
        type="button"
        onClick={onClose}
        className="flex h-10 w-10 shrink-0 items-center justify-center border border-white/[0.09] bg-white/[0.02] text-lg text-white/55 transition hover:border-[#ff5a2a]/30 hover:text-white"
      >
        <span className="glow-btn-content">
          ×
        </span>
      </button>

    </div>
  );
}

// =====================================================
// FIELD
// =====================================================

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required = false,
  min,
  max,
  step,
}: {
  label: string;
  type?: string;

  value: string;

  onChange: (
    value: string
  ) => void;

  placeholder?: string;

  required?: boolean;

  min?: string;
  max?: string;
  step?: string;
}) {
  return (
    <label className="block">

      <span className="text-xs text-white/35">
        {label}
      </span>

      <input
        type={type}
        value={value}
        required={required}
        placeholder={
          placeholder
        }
        min={min}
        max={max}
        step={step}
        onChange={(e) =>
          onChange(
            e.target.value
          )
        }
        className="mt-2 h-12 w-full border border-white/[0.09] bg-black/25 px-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/45"
      />

    </label>
  );
}

// =====================================================
// PAYMENT METRIC
// =====================================================

function PaymentMetric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`border p-3 ${
        accent
          ? "border-amber-400/15 bg-amber-400/[0.04]"
          : "border-white/[0.07] bg-white/[0.025]"
      }`}
    >

      <p className="text-[10px] uppercase tracking-[0.1em] text-white/30">
        {label}
      </p>

      <p
        className={`mt-2 text-sm font-semibold ${
          accent
            ? "text-amber-200"
            : ""
        }`}
      >
        {value}
      </p>

    </div>
  );
}

// =====================================================
// ERROR
// =====================================================

function ErrorBox({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
      {children}
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

function getInitials(
  firstName: string,
  lastName: string
) {
  return `${firstName.charAt(
    0
  )}${lastName.charAt(
    0
  )}`.toUpperCase();
}

function formatLocation(
  rrpp: RRPP
) {
  const parts = [
    rrpp.assignedCity,
    rrpp.assignedZone,
  ].filter(Boolean);

  if (
    parts.length > 0
  ) {
    return parts.join(
      " · "
    );
  }

  return "Sin zona asignada";
}

function normalizeText(
  value: string
) {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLocaleLowerCase(
      "es-AR"
    )
    .trim();
}
