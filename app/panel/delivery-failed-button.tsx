"use client";

import {
  FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type Props = {
  ticketId: string;
  ticketNumber?: number | string | null;
};

export default function DeliveryFailedButton({
  ticketId,
  ticketNumber,
}: Props) {
  const router =
    useRouter();

  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    reason,
    setReason,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    success,
    setSuccess,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  // ==========================================================
  // ABRIR
  // ==========================================================

  function openModal() {
    setReason("");
    setError("");
    setSuccess(false);
    setOpen(true);
  }

  // ==========================================================
  // CERRAR
  // ==========================================================

  function closeModal() {
    if (loading) {
      return;
    }

    setOpen(false);
    setReason("");
    setError("");
    setSuccess(false);
  }

  // ==========================================================
  // REGISTRAR
  // ==========================================================

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/entradas/${ticketId}/no-entregada`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              reason:
                reason.trim(),
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "No se pudo registrar la entrada como no entregada."
        );
      }

      setSuccess(true);

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo registrar la entrada como no entregada."
      );
    } finally {
      setLoading(false);
    }
  }

  const formattedNumber =
    ticketNumber === null ||
    ticketNumber === undefined
      ? "Entrada"
      : `#${String(
          ticketNumber
        ).padStart(
          7,
          "0"
        )}`;

  return (
    <>
      {/* ======================================================
          BOTÓN
      ====================================================== */}

      <button
        type="button"
        onClick={openModal}
        className="inline-flex h-10 items-center justify-center rounded-xl border border-orange-400/20 bg-orange-400/[0.06] px-4 text-xs font-semibold text-orange-200 transition duration-200 hover:scale-[1.03] hover:border-orange-300/35 hover:bg-orange-400/[0.11] hover:shadow-[0_0_25px_rgba(251,146,60,.10)]"
      >
        ⚠ No entregada
      </button>

      {/* ======================================================
          MODAL
      ====================================================== */}

      {open && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/85 px-4 py-6 text-white backdrop-blur-md">

          <section className="relative w-full max-w-[500px] overflow-hidden rounded-[30px] border border-orange-400/20 bg-[#100b07] shadow-[0_30px_120px_rgba(249,115,22,.12)]">

            {/* GLOW */}

            <div className="pointer-events-none absolute -right-24 -top-24 h-[280px] w-[280px] rounded-full bg-orange-500/[0.08] blur-[100px]" />

            <div className="relative p-6 sm:p-7">

              {/* HEADER */}

              <div className="flex items-start justify-between gap-5">

                <div>

                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">
                    Problema de entrega
                  </p>

                  <h2 className="mt-2 text-xl font-semibold">
                    Marcar como no entregada
                  </h2>

                  <p className="mt-2 text-sm text-white/40">
                    {formattedNumber}
                  </p>

                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  disabled={loading}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-lg text-white/60 transition hover:scale-105 hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
                  aria-label="Cerrar"
                >
                  ×
                </button>

              </div>

              {/* ==================================================
                  SUCCESS
              ================================================== */}

              {success ? (
                <div className="mt-7">

                  <div className="rounded-[22px] border border-emerald-400/20 bg-emerald-400/[0.07] p-5">

                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/[0.08] text-lg text-emerald-300">
                      ✓
                    </div>

                    <h3 className="mt-4 font-semibold text-emerald-100">
                      Entrada registrada
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-white/45">
                      Capital Pass agregó esta entrada a
                      Notificaciones como no entregada.
                    </p>

                  </div>

                  <button
                    type="button"
                    onClick={closeModal}
                    className="mt-5 h-12 w-full rounded-xl border border-orange-400/20 bg-orange-400/[0.08] text-sm font-semibold text-orange-200 transition hover:scale-[1.01] hover:bg-orange-400/[0.13]"
                  >
                    Cerrar
                  </button>

                </div>
              ) : (

                <form
                  onSubmit={handleSubmit}
                  className="mt-7"
                >

                  {/* EXPLICACIÓN */}

                  <div className="rounded-[20px] border border-orange-400/15 bg-orange-400/[0.045] p-4">

                    <p className="text-sm font-medium text-orange-100">
                      ¿Qué significa esto?
                    </p>

                    <p className="mt-2 text-xs leading-5 text-white/40">
                      Usalo cuando el comprador te avise que
                      no recibió su entrada o cuando detectes
                      un problema con el envío.
                    </p>

                  </div>

                  {/* MOTIVO */}

                  <label className="mt-6 block">

                    <span className="text-xs font-medium text-white/55">
                      Motivo
                    </span>

                    <textarea
                      value={reason}
                      onChange={(event) =>
                        setReason(
                          event.target.value
                        )
                      }
                      placeholder="Ej.: El comprador indicó que no recibió el mensaje de WhatsApp."
                      rows={4}
                      maxLength={500}
                      className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/20 focus:border-orange-400/40 focus:ring-4 focus:ring-orange-400/[0.06]"
                    />

                    <div className="mt-2 flex items-center justify-between gap-4">

                      <p className="text-[10px] text-white/25">
                        Opcional
                      </p>

                      <p className="text-[10px] text-white/20">
                        {reason.length}/500
                      </p>

                    </div>

                  </label>

                  {/* NOTA */}

                  <div className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3">

                    <p className="text-xs leading-5 text-white/35">
                      Esto no anula la entrada. El ticket
                      seguirá siendo válido para ingresar.
                      Solamente genera una alerta para que el
                      organizador pueda resolver el problema
                      de entrega.
                    </p>

                  </div>

                  {/* ERROR */}

                  {error && (
                    <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                      {error}
                    </div>
                  )}

                  {/* BOTONES */}

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">

                    <button
                      type="button"
                      onClick={closeModal}
                      disabled={loading}
                      className="h-12 rounded-xl border border-white/10 bg-white/[0.035] text-sm font-medium text-white/65 transition hover:scale-[1.02] hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                    >
                      Cancelar
                    </button>

                    <button
                      type="submit"
                      disabled={loading}
                      className="h-12 rounded-xl border border-orange-400/25 bg-orange-400/[0.10] text-sm font-semibold text-orange-200 transition hover:scale-[1.02] hover:bg-orange-400/[0.16] hover:shadow-[0_0_30px_rgba(251,146,60,.10)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {loading
                        ? "Registrando..."
                        : "Marcar no entregada"}
                    </button>

                  </div>

                </form>
              )}

            </div>

          </section>

        </div>
      )}
    </>
  );
}