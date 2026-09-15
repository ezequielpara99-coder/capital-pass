"use client";

import {
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type Props = {
  attemptId: string;
};

export default function DeliveryResolveButton({
  attemptId,
}: Props) {
  const router = useRouter();

  const [open, setOpen] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function resolveAttempt() {
    if (loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/entregas/" + attemptId + "/resolver",
        {
          method: "PATCH",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "No se pudo marcar la alerta como resuelta."
        );
      }

      setOpen(false);

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo marcar la alerta como resuelta."
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
        className="inline-flex h-10 items-center justify-center border border-emerald-400/20 bg-emerald-400/[0.07] px-4 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200 transition hover:bg-emerald-400/[0.12]"
      >
        ✓ Resuelta
      </button>

      {open && (
        <div className="fixed inset-0 z-[800] flex items-center justify-center bg-black/85 px-4 py-6 text-[#f7f3ed] backdrop-blur-md">
          <section className="relative w-full max-w-[470px] overflow-hidden border border-white/[0.10] bg-[#080706] shadow-[0_30px_120px_rgba(0,0,0,.55)]">
            <div className="pointer-events-none absolute -right-28 -top-28 h-[300px] w-[300px] rounded-full bg-emerald-500/[0.09] blur-[100px]" />

            <div className="relative border-b border-white/[0.08] p-6">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.30em] text-emerald-200">
                    Problema de entrega
                  </p>

                  <h2 className="mt-3 text-3xl font-black uppercase leading-[0.9] tracking-[-0.055em]">
                    Marcar como resuelta.
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                  className="flex h-10 w-10 shrink-0 items-center justify-center border border-white/10 bg-white/[0.04] text-lg text-white/60 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="relative p-6">
              <div className="border border-emerald-400/15 bg-emerald-400/[0.055] p-4">
                <p className="text-sm font-bold text-emerald-100">
                  ¿El comprador ya recibió su entrada?
                </p>

                <p className="mt-2 text-xs leading-5 text-[#f7f3ed]/45">
                  La alerta dejará de requerir atención, pero permanecerá guardada en el historial.
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
                  onClick={() => setOpen(false)}
                  disabled={loading}
                  className="h-12 border border-white/10 bg-white/[0.035] text-[11px] font-black uppercase tracking-[0.18em] text-white/65 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={resolveAttempt}
                  disabled={loading}
                  className="h-12 border border-emerald-400/25 bg-emerald-400/[0.10] text-[11px] font-black uppercase tracking-[0.16em] text-emerald-100 transition hover:bg-emerald-400/[0.16] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? "Resolviendo..." : "Confirmar"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

