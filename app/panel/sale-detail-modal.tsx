"use client";

import {
  FormEvent,
  ReactNode,
  useEffect,
  useState,
} from "react";

import DeliveryFailedButton from "./delivery-failed-button";

// ============================================================
// TYPES
// ============================================================

type RefundStatus =
  | "pending"
  | "refunded"
  | "no_refund";

type TicketReturn = {
  id: string;
  reason: string | null;
  refundStatus: string;
  refundAmountMinor: number;
  returnedAt: string;
  refundedAt: string | null;
};

type TicketDetail = {
  id: string;

  displayNumber:
    | number
    | string
    | null;

  manualCode:
    | string
    | null;

  status: string;

  ticketTypeId: string;
  ticketType: string;

  unitPriceMinor: number;

  issuedAt:
    | string
    | null;

  usedAt:
    | string
    | null;

  cancelledAt:
    | string
    | null;

  canReturn: boolean;

  return:
    | TicketReturn
    | null;
};

type SaleDetail = {
  ok: true;

  sale: {
    id: string;
    status: string;
    channel: string;
    totalMinor: number;
    currency: string;

    confirmedAt:
      | string
      | null;

    createdAt: string;
  };

  event: {
    id: string;
    name: string;

    city:
      | string
      | null;

    venueName:
      | string
      | null;

    startsAt:
      | string
      | null;
  };

  buyer: {
    id:
      | string
      | null;

    firstName: string;
    lastName: string;

    dni:
      | string
      | null;

    phone:
      | string
      | null;
  };

  seller:
    | {
        memberId: string;
        name: string;
      }
    | null;

  tickets: TicketDetail[];

  metrics: {
    totalTickets: number;
    activeTickets: number;
    usedTickets: number;
    returnedTickets: number;
  };
};

type Props = {
  open: boolean;

  saleId:
    | string
    | null;

  onClose: () => void;

  onChanged?: () => void;
};

// ============================================================
// COMPONENT
// ============================================================

export default function SaleDetailModal({
  open,
  saleId,
  onClose,
  onChanged,
}: Props) {
  const [
    detail,
    setDetail,
  ] =
    useState<SaleDetail | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    success,
    setSuccess,
  ] =
    useState("");

  const [
    selectedTicket,
    setSelectedTicket,
  ] =
    useState<TicketDetail | null>(
      null
    );

  const [
    reason,
    setReason,
  ] =
    useState("");

  const [
    refundStatus,
    setRefundStatus,
  ] =
    useState<RefundStatus>(
      "pending"
    );

  const [
    refundAmount,
    setRefundAmount,
  ] =
    useState("");

  const [
    returning,
    setReturning,
  ] =
    useState(false);

  const [
    viewingTicketId,
    setViewingTicketId,
  ] =
    useState<string | null>(
      null
    );

  // ==========================================================
  // BLOQUEAR SCROLL
  // ==========================================================

  useEffect(() => {
    if (!open) {
      return;
    }

    const oldOverflow =
      document.body.style
        .overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        oldOverflow;
    };
  }, [open]);

  // ==========================================================
  // ESC
  // ==========================================================

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (
        event.key !==
        "Escape"
      ) {
        return;
      }

      if (
        selectedTicket
      ) {
        setSelectedTicket(
          null
        );

        setError("");

        return;
      }

      onClose();
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    open,
    onClose,
    selectedTicket,
  ]);

  // ==========================================================
  // CARGAR DETALLE
  // ==========================================================

  useEffect(() => {
    if (
      !open ||
      !saleId
    ) {
      return;
    }

    loadDetail();

    // Al cerrar el modal (o cambiar de venta), limpiamos lo que quedo
    // cargado -- en el cleanup, no de una vez en el cuerpo del efecto.
    return () => {
      setDetail(null);
      setError("");
      setSuccess("");
      setSelectedTicket(null);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    saleId,
  ]);

  async function loadDetail() {
    if (!saleId) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/ventas/${saleId}/detalle`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "No se pudo cargar la venta."
        );
      }

      setDetail(
        data as SaleDetail
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la venta."
      );
    } finally {
      setLoading(false);
    }
  }

  // ==========================================================
  // VER ENTRADA
  // ==========================================================

  async function viewTicket(
    ticketId: string
  ) {
    setError("");
    setSuccess("");

    const previewWindow =
      window.open(
        "about:blank",
        "_blank"
      );

    if (!previewWindow) {
      setError(
        "El navegador bloqueó la nueva pestaña. Permití ventanas emergentes para Capital Pass e intentá nuevamente."
      );

      return;
    }

    previewWindow.opener =
      null;

    setViewingTicketId(
      ticketId
    );

    try {
      const response =
        await fetch(
          `/api/entradas/${ticketId}/ver`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "No se pudo abrir la entrada."
        );
      }

      if (
        !data?.url ||
        typeof data.url !==
          "string"
      ) {
        throw new Error(
          "No se pudo generar el enlace seguro de la entrada."
        );
      }

      const finalUrl =
        data.url.startsWith(
          "http"
        )
          ? data.url
          : `${window.location.origin}${data.url}`;

      previewWindow.location.replace(
        finalUrl
      );
    } catch (err) {
      previewWindow.close();

      setError(
        err instanceof Error
          ? err.message
          : "No se pudo abrir la entrada."
      );
    } finally {
      setViewingTicketId(
        null
      );
    }
  }

  // ==========================================================
  // ABRIR DEVOLUCIÓN
  // ==========================================================

  function openReturn(
    ticket: TicketDetail
  ) {
    setError("");
    setSuccess("");

    setSelectedTicket(
      ticket
    );

    setReason("");

    setRefundStatus(
      "pending"
    );

    setRefundAmount(
      String(
        ticket.unitPriceMinor
      )
    );
  }

  // ==========================================================
  // DEVOLVER ENTRADA
  // ==========================================================

  async function returnTicket(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !selectedTicket
    ) {
      return;
    }

    setReturning(true);
    setError("");
    setSuccess("");

    try {
      if (
        !reason.trim()
      ) {
        throw new Error(
          "Indicá el motivo de la devolución."
        );
      }

      let amount =
        0;

      if (
        refundStatus !==
        "no_refund"
      ) {
        amount =
          Number(
            refundAmount
          );

        if (
          !Number.isFinite(
            amount
          ) ||
          amount < 0
        ) {
          throw new Error(
            "Ingresá un importe de reintegro válido."
          );
        }
      }

      const response =
        await fetch(
          "/api/entradas/devolver",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                ticketId:
                  selectedTicket.id,

                reason:
                  reason.trim(),

                refundStatus,

                refundAmountMinor:
                  refundStatus ===
                  "no_refund"
                    ? 0
                    : Math.round(
                        amount
                      ),
              }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "No se pudo devolver la entrada."
        );
      }

      setSelectedTicket(
        null
      );

      setSuccess(
        "Entrada devuelta correctamente."
      );

      await loadDetail();

      onChanged?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo devolver la entrada."
      );
    } finally {
      setReturning(false);
    }
  }

  // ==========================================================
  // CLOSED
  // ==========================================================

  if (
    !open ||
    !saleId
  ) {
    return null;
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="fixed inset-0 z-[300] overflow-y-auto bg-black/85 px-4 py-6 text-white backdrop-blur-md">

      <div className="mx-auto flex min-h-full max-w-[1000px] items-center justify-center">

        <div className="relative w-full overflow-hidden rounded-[30px] border border-[#ff5a2a]/20 bg-[#080b11] text-white shadow-[0_30px_120px_rgba(255,90,42,.12)]">

          {/* ==================================================
              GLOWS
          ================================================== */}

          <div className="pointer-events-none absolute right-[-120px] top-[-140px] h-[360px] w-[360px] rounded-full bg-[#ff3b24]/10 blur-[110px]" />

          <div className="pointer-events-none absolute bottom-[-180px] left-[20%] h-[380px] w-[380px] rounded-full bg-blue-600/[0.08] blur-[120px]" />

          {/* ==================================================
              HEADER
          ================================================== */}

          <div className="relative flex items-start justify-between gap-5 border-b border-white/[0.09] px-6 py-6 md:px-8">

            <div>

              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ff9a7d]">
                Detalle de venta
              </p>

              <h2 className="mt-2 text-2xl font-semibold text-white">
                {detail
                  ? `${detail.buyer.firstName} ${detail.buyer.lastName}`.trim() ||
                    "Comprador"
                  : "Cargando venta..."}
              </h2>

              {detail && (
                <p className="mt-2 text-sm text-white/60">
                  {
                    detail.event
                      .name
                  }
                  {" · "}
                  {formatChannel(
                    detail.sale
                      .channel
                  )}
                </p>
              )}

            </div>

            <button
              type="button"
              onClick={
                onClose
              }
              className="flex h-11 w-11 shrink-0 items-center justify-center border border-white/[0.10] bg-white/[0.02] text-xl text-white/60 transition hover:border-[#ff5a2a]/30 hover:text-white"
            >
              ×
            </button>

          </div>

          {/* ==================================================
              LOADING
          ================================================== */}

          {loading &&
            !detail && (

              <div className="relative p-8">

                <div className="grid gap-3 sm:grid-cols-4">

                  {[1, 2, 3, 4].map(
                    (item) => (

                      <div
                        key={
                          item
                        }
                        className="h-24 animate-pulse rounded-2xl border border-white/[0.08] bg-white/[0.04]"
                      />

                    )
                  )}

                </div>

                <div className="mt-5 h-72 animate-pulse rounded-2xl border border-white/[0.08] bg-white/[0.04]" />

              </div>

            )}

          {/* ==================================================
              ERROR
          ================================================== */}

          {error && (
            <div className="relative mx-6 mt-6 rounded-2xl border border-red-500/25 bg-red-500/[0.10] px-4 py-3 text-sm text-red-200 md:mx-8">
              {error}
            </div>
          )}

          {/* ==================================================
              SUCCESS
          ================================================== */}

          {success && (
            <div className="relative mx-6 mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.08] px-4 py-3 text-sm text-emerald-200 md:mx-8">
              ✓ {success}
            </div>
          )}

          {detail && (

            <div className="relative p-6 md:p-8">

              {/* ==============================================
                  RESUMEN
              ============================================== */}

              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

                <Metric
                  label="Total venta"
                  value={formatMoney(
                    detail.sale
                      .totalMinor
                  )}
                  accent
                />

                <Metric
                  label="Entradas"
                  value={String(
                    detail.metrics
                      .totalTickets
                  )}
                />

                <Metric
                  label="Utilizadas"
                  value={String(
                    detail.metrics
                      .usedTickets
                  )}
                  success={
                    detail.metrics
                      .usedTickets >
                    0
                  }
                />

                <Metric
                  label="Devueltas"
                  value={String(
                    detail.metrics
                      .returnedTickets
                  )}
                  danger={
                    detail.metrics
                      .returnedTickets >
                    0
                  }
                />

              </section>

              {/* ==============================================
                  COMPRADOR + VENTA
              ============================================== */}

              <section className="mt-5 grid gap-4 lg:grid-cols-2">

                <InfoCard
                  title="Comprador"
                >

                  <InfoLine
                    label="Nombre"
                    value={
                      `${detail.buyer.firstName} ${detail.buyer.lastName}`.trim() ||
                      "—"
                    }
                  />

                  <InfoLine
                    label="DNI"
                    value={
                      detail.buyer
                        .dni ??
                      "—"
                    }
                  />

                  <InfoLine
                    label="WhatsApp"
                    value={
                      detail.buyer
                        .phone ??
                      "—"
                    }
                  />

                </InfoCard>

                <InfoCard
                  title="Venta"
                >

                  <InfoLine
                    label="Canal"
                    value={formatChannel(
                      detail.sale
                        .channel
                    )}
                  />

                  <InfoLine
                    label="Vendedor"
                    value={
                      detail.seller
                        ?.name ??
                      "Organizador"
                    }
                  />

                  <InfoLine
                    label="Fecha"
                    value={formatDate(
                      detail.sale
                        .confirmedAt ??
                        detail.sale
                          .createdAt
                    )}
                  />

                </InfoCard>

              </section>

              {/* ==============================================
                  ENTRADAS
              ============================================== */}

              <section className="mt-5 overflow-hidden rounded-[24px] border border-white/[0.09] bg-[#0a0e14]">

                <div className="flex flex-col justify-between gap-3 border-b border-white/[0.09] px-5 py-5 sm:flex-row sm:items-center">

                  <div>

                    <h3 className="font-semibold text-white">
                      Entradas de esta venta
                    </h3>

                    <p className="mt-1 text-xs text-white/55">
                      Podés revisar cualquier entrada y devolver únicamente las que todavía no fueron utilizadas.
                    </p>

                  </div>

                  <span className="rounded-full border border-[#ff5a2a]/20 bg-[#ff5a2a]/[0.08] px-3 py-1.5 text-xs font-medium text-[#ffc0ad]">
                    {
                      detail.metrics
                        .activeTickets
                    }{" "}
                    vigentes
                  </span>

                </div>

                <div className="max-h-[440px] divide-y divide-white/[0.08] overflow-y-auto">

                  {detail.tickets.map(
                    (ticket) => (

                      <div
                        key={
                          ticket.id
                        }
                        className="flex flex-col justify-between gap-4 px-5 py-5 transition hover:bg-[#ff5a2a]/[0.025] sm:flex-row sm:items-center"
                      >

                        <div className="min-w-0">

                          <div className="flex flex-wrap items-center gap-2">

                            <p className="font-semibold text-white">
                              {formatTicketNumber(
                                ticket.displayNumber
                              )}
                            </p>

                            <TicketStatus
                              ticket={
                                ticket
                              }
                            />

                          </div>

                          <p className="mt-2 text-sm font-medium text-white/70">
                            {
                              ticket.ticketType
                            }
                            {" · "}
                            {formatMoney(
                              ticket.unitPriceMinor
                            )}
                          </p>

                          {ticket.manualCode && (
                            <p className="mt-1 font-mono text-[11px] text-white/40">
                              Código:{" "}
                              {
                                ticket.manualCode
                              }
                            </p>
                          )}

                          {ticket.return && (

                            <div className="mt-3 rounded-xl border border-red-400/15 bg-red-400/[0.05] px-3 py-2">

                              <p className="text-xs text-red-200">
                                Motivo:{" "}
                                {ticket.return
                                  .reason ??
                                  "Sin motivo"}
                              </p>

                              <p className="mt-1 text-[11px] text-white/45">

                                {formatRefundStatus(
                                  ticket.return
                                    .refundStatus
                                )}

                                {ticket.return
                                  .refundAmountMinor >
                                  0
                                  ? ` · ${formatMoney(
                                      ticket
                                        .return
                                        .refundAmountMinor
                                    )}`
                                  : ""}

                              </p>

                            </div>

                          )}

                        </div>

                        <div className="shrink-0">

                          <div className="flex flex-wrap justify-end gap-2">

                            <button
                              type="button"
                              onClick={() =>
                                viewTicket(
                                  ticket.id
                                )
                              }
                              disabled={
                                viewingTicketId ===
                                ticket.id
                              }
                              className="inline-flex h-10 items-center justify-center border border-[#ff5a2a]/25 bg-[#ff3b24]/[0.08] px-4 text-xs font-semibold text-[#ff9b82] transition duration-200 hover:scale-[1.04] hover:border-[#ff5a2a]/40 hover:bg-[#ff3b24]/[0.14] hover:shadow-[0_0_25px_rgba(255,59,36,.14)] disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              {viewingTicketId ===
                              ticket.id
                                ? "Abriendo..."
                                : "👁 Ver entrada"}
                            </button>

                            {ticket.status ===
                              "issued" && (

                              <DeliveryFailedButton
                                ticketId={
                                  ticket.id
                                }
                                ticketNumber={
                                  ticket.displayNumber
                                }
                              />

                            )}

                            {ticket.status ===
                              "issued" &&
                              ticket.canReturn && (

                              <button
                                type="button"
                                onClick={() =>
                                  openReturn(
                                    ticket
                                  )
                                }
                                className="inline-flex h-10 items-center justify-center rounded-xl border border-red-400/25 bg-red-400/[0.07] px-4 text-xs font-semibold text-red-200 transition duration-200 hover:scale-[1.04] hover:border-red-300/40 hover:bg-red-400/[0.13] hover:shadow-[0_0_25px_rgba(248,113,113,.12)]"
                              >
                                Devolver entrada
                              </button>

                            )}

                            {ticket.status ===
                              "used" && (

                              <span className="inline-flex h-10 items-center text-xs font-medium text-emerald-300">
                                Ya utilizada
                              </span>

                            )}

                            {ticket.status ===
                              "cancelled" && (

                              <span className="inline-flex h-10 items-center text-xs font-medium text-red-300">
                                Devuelta
                              </span>

                            )}

                          </div>

                        </div>

                      </div>

                    )
                  )}

                </div>

              </section>

            </div>

          )}

        </div>

      </div>

      {/* ======================================================
          MODAL DEVOLUCIÓN
      ====================================================== */}

      {selectedTicket && (

        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/85 px-4 py-6 text-white backdrop-blur-md">

          <div className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-red-400/20 bg-[#0d0912] p-6 text-white shadow-[0_30px_100px_rgba(239,68,68,.12)]">

            <div className="pointer-events-none absolute right-[-100px] top-[-100px] h-[260px] w-[260px] rounded-full bg-red-500/[0.06] blur-[90px]" />

            <div className="relative">

              <div className="flex items-start justify-between gap-5">

                <div>

                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-300">
                    Devolución
                  </p>

                  <h3 className="mt-2 text-xl font-semibold text-white">
                    {formatTicketNumber(
                      selectedTicket.displayNumber
                    )}
                  </h3>

                  <p className="mt-2 text-sm text-white/60">
                    {
                      selectedTicket.ticketType
                    }
                    {" · "}
                    {formatMoney(
                      selectedTicket.unitPriceMinor
                    )}
                  </p>

                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedTicket(
                      null
                    );

                    setError("");
                  }}
                  className="flex h-10 w-10 items-center justify-center border border-white/[0.10] bg-white/[0.02] text-lg text-white/60 transition hover:border-[#ff5a2a]/30 hover:text-white"
                >
                  ×
                </button>

              </div>

              <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-4">

                <p className="text-sm font-semibold text-red-200">
                  Esta acción anula la entrada.
                </p>

                <p className="mt-2 text-xs leading-5 text-white/55">
                  El QR dejará de ser válido para ingresar, pero la venta y el historial se conservarán.
                </p>

              </div>

              <form
                onSubmit={
                  returnTicket
                }
                className="mt-5 space-y-4"
              >

                <label className="block">

                  <span className="text-xs font-medium text-white/60">
                    Motivo de la devolución
                  </span>

                  <textarea
                    value={
                      reason
                    }
                    onChange={(
                      event
                    ) =>
                      setReason(
                        event
                          .target
                          .value
                      )
                    }
                    placeholder="Ej. El comprador se equivocó al realizar la compra."
                    rows={3}
                    required
                    className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-red-400/45"
                  />

                </label>

                <label className="block">

                  <span className="text-xs font-medium text-white/60">
                    Estado del reintegro
                  </span>

                  <select
                    value={
                      refundStatus
                    }
                    onChange={(
                      event
                    ) => {
                      const value =
                        event.target
                          .value as RefundStatus;

                      setRefundStatus(
                        value
                      );

                      if (
                        value ===
                        "no_refund"
                      ) {
                        setRefundAmount(
                          "0"
                        );
                      } else if (
                        Number(
                          refundAmount
                        ) ===
                        0
                      ) {
                        setRefundAmount(
                          String(
                            selectedTicket
                              .unitPriceMinor
                          )
                        );
                      }
                    }}
                    className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-[#15101a] px-4 text-sm text-white outline-none focus:border-red-400/45"
                  >

                    <option
                      value="pending"
                      className="bg-[#15101a] text-white"
                    >
                      Reintegro pendiente
                    </option>

                    <option
                      value="refunded"
                      className="bg-[#15101a] text-white"
                    >
                      Dinero reintegrado
                    </option>

                    <option
                      value="no_refund"
                      className="bg-[#15101a] text-white"
                    >
                      Sin reintegro
                    </option>

                  </select>

                </label>

                {refundStatus !==
                  "no_refund" && (

                  <label className="block">

                    <span className="text-xs font-medium text-white/60">
                      Importe del reintegro
                    </span>

                    <input
                      type="number"
                      min="0"
                      max={
                        selectedTicket
                          .unitPriceMinor
                      }
                      step="1"
                      value={
                        refundAmount
                      }
                      onChange={(
                        event
                      ) =>
                        setRefundAmount(
                          event
                            .target
                            .value
                        )
                      }
                      className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm text-white outline-none focus:border-red-400/45"
                    />

                    <p className="mt-2 text-[11px] text-white/40">
                      Máximo:{" "}
                      {formatMoney(
                        selectedTicket
                          .unitPriceMinor
                      )}
                    </p>

                  </label>

                )}

                {error && (

                  <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {error}
                  </div>

                )}

                <div className="grid gap-3 pt-2 sm:grid-cols-2">

                  <button
                    type="button"
                    disabled={
                      returning
                    }
                    onClick={() =>
                      setSelectedTicket(
                        null
                      )
                    }
                    className="inline-flex h-12 items-center justify-center border border-white/[0.10] bg-white/[0.02] text-sm font-medium text-white/70 transition hover:border-white/25 hover:text-white disabled:opacity-40"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={
                      returning
                    }
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/[0.14] text-sm font-semibold text-red-100 transition duration-200 hover:scale-[1.02] hover:bg-red-500/[0.20] hover:shadow-[0_0_30px_rgba(239,68,68,.14)] disabled:opacity-40"
                  >
                    {returning
                      ? "Devolviendo..."
                      : "Confirmar devolución"}
                  </button>

                </div>

              </form>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}

// ============================================================
// METRIC
// ============================================================

function Metric({
  label,
  value,
  accent = false,
  success = false,
  danger = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  success?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        danger
          ? "border-red-400/20 bg-red-400/[0.05]"
          : success
            ? "border-emerald-400/20 bg-emerald-400/[0.05]"
            : accent
              ? "border-[#ff5a2a]/20 bg-[#ff5a2a]/[0.07]"
              : "border-white/[0.09] bg-white/[0.035]"
      }`}
    >

      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/50">
        {label}
      </p>

      <p
        className={`mt-2 text-lg font-semibold ${
          danger
            ? "text-red-200"
            : success
              ? "text-emerald-200"
              : accent
                ? "text-[#ffc0ad]"
                : "text-white"
        }`}
      >
        {value}
      </p>

    </div>
  );
}

// ============================================================
// INFO CARD
// ============================================================

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-white/[0.09] bg-white/[0.03] p-5 text-white">

      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#ff9a7d]">
        {title}
      </p>

      <div className="mt-4 space-y-3">
        {children}
      </div>

    </div>
  );
}

// ============================================================
// INFO LINE
// ============================================================

function InfoLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-5">

      <span className="text-xs text-white/50">
        {label}
      </span>

      <span className="text-right text-sm font-medium text-white/85">
        {value}
      </span>

    </div>
  );
}

// ============================================================
// TICKET STATUS
// ============================================================

function TicketStatus({
  ticket,
}: {
  ticket: TicketDetail;
}) {
  if (
    ticket.status ===
    "issued"
  ) {
    return (
      <span className="rounded-full border border-[#ff5a2a]/20 bg-[#ff5a2a]/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#ffc0ad]">
        Vigente
      </span>
    );
  }

  if (
    ticket.status ===
    "used"
  ) {
    return (
      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-200">
        Utilizada
      </span>
    );
  }

  if (
    ticket.status ===
    "cancelled"
  ) {
    return (
      <span className="rounded-full border border-red-400/20 bg-red-400/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-200">
        Devuelta
      </span>
    );
  }

  return (
    <span className="rounded-full border border-white/15 bg-white/[0.07] px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] text-white/70">
      {ticket.status}
    </span>
  );
}

// ============================================================
// HELPERS
// ============================================================

function formatMoney(
  value: number
) {
  return new Intl.NumberFormat(
    "es-AR",
    {
      style: "currency",

      currency: "ARS",

      maximumFractionDigits:
        0,
    }
  ).format(value);
}

function formatTicketNumber(
  value:
    | number
    | string
    | null
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "Entrada";
  }

  return `#${String(
    value
  ).padStart(
    7,
    "0"
  )}`;
}

function formatChannel(
  value: string
) {
  if (
    value ===
    "rrpp"
  ) {
    return "RRPP";
  }

  if (
    value ===
    "door"
  ) {
    return "Puerta";
  }

  return "Organizador";
}

function formatDate(
  value: string
) {
  return new Intl.DateTimeFormat(
    "es-AR",
    {
      day: "2-digit",

      month: "2-digit",

      year: "numeric",

      hour: "2-digit",

      minute: "2-digit",

      timeZone:
        "America/Argentina/Buenos_Aires",
    }
  ).format(
    new Date(value)
  );
}

function formatRefundStatus(
  value: string
) {
  if (
    value ===
    "refunded"
  ) {
    return "Dinero reintegrado";
  }

  if (
    value ===
    "no_refund"
  ) {
    return "Sin reintegro";
  }

  return "Reintegro pendiente";
}