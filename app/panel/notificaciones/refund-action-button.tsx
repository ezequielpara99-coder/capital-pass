"use client";

import {
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type Props = {
  returnId: string;
  amount: number;
};

export default function RefundActionButton({
  returnId,
  amount,
}: Props) {
  const router = useRouter();

  const [open, setOpen] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function confirmRefund() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/devoluciones/" + returnId + "/reintegrar",
        {
          method: "PATCH",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "No se pudo registrar el reintegro."
        );
      }

      setOpen(false);

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo registrar el reintegro."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        className="mt-4 inline-flex h-10 items-center justify-center border border-amber-400/20 bg-amber-400/[0.08] px-4 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100 transition hover:bg-amber-400/[0.13]"
      >
        Registrar reintegro
      </button>

      {open && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/85 px-4 py-6 text-[#f7f3ed] backdrop-blur-md">
          <section className="relative w-full max-w-[470px] overflow-hidden border border-white/[0.10] bg-[#080706] shadow-[0_30px_120px_rgba(0,0,0,.55)]">
            <div className="pointer-events-none absolute -right-28 -top-28 h-[300px] w-[300px] rounded-full bg-amber-500/[0.09] blur-[100px]" />

            <div className="relative border-b border-white/[0.08] p-6">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.30em] text-amber-200">
                    Confirmar reintegro
                  </p>

                  <h2 className="mt-3 text-3xl font-black uppercase leading-[0.9] tracking-[-0.055em]">
                    ¿El dinero ya fue devuelto?
                  </h2>
                </div>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setOpen(false);
                    setError("");
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center border border-white/10 bg-white/[0.04] text-lg text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="relative p-6">
              <div className="border border-amber-400/15 bg-amber-400/[0.055] p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#f7f3ed]/40">
                  Importe del reintegro
                </p>

                <p className="mt-3 text-4xl font-black tracking-[-0.06em] text-amber-100">
                  {formatMoney(amount)}
                </p>
              </div>

              <p className="mt-5 text-sm leading-6 text-[#f7f3ed]/50">
                Al confirmar, Capital Pass registrará este reintegro como pagado y guardará la fecha en el historial de la devolución.
              </p>

              <div className="mt-4 border border-white/[0.07] bg-white/[0.025] px-4 py-3">
                <p className="text-xs leading-5 text-[#f7f3ed]/40">
                  Esta acción no reactiva la entrada. El ticket continuará anulado y no podrá utilizarse para ingresar.
                </p>
              </div>

              {error && (
                <div className="mt-4 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">
                  {error}
                </div>
              )}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setOpen(false);
                    setError("");
                  }}
                  className="h-12 border border-white/10 bg-white/[0.035] text-[11px] font-black uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={confirmRefund}
                  className="h-12 border border-emerald-400/25 bg-emerald-400/[0.10] text-[11px] font-black uppercase tracking-[0.14em] text-emerald-100 transition hover:bg-emerald-400/[0.16] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? "Registrando..." : "Confirmar pago"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(
    "es-AR",
    {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }
  ).format(value);
}

