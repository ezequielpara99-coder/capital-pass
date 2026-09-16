"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createRecoveryClient } from "../../lib/supabase/client";

export const dynamic = "force-dynamic";

// ============================================================
// PANTALLA INTERMEDIA DE RECUPERACIÓN
//
// El link del email NO verifica el token automáticamente al
// abrirse (a diferencia del link por defecto de Supabase).
// Muchos filtros de seguridad de correo (Gmail, antivirus,
// Defender, etc.) visitan automáticamente los links de un
// email para escanearlos antes de que el usuario los abra,
// y eso "gasta" un link de un solo uso antes de tiempo.
//
// Acá el token sólo se consume cuando el usuario hace clic
// en el botón: un escaneo automático nunca hace eso.
// ============================================================

export default function ConfirmRecoveryPage() {
  const router = useRouter();
  const [supabase] = useState(() => createRecoveryClient());

  const [tokenHash, setTokenHash] = useState("");
  const [ready, setReady] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);

    const hash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type");

    if (!hash || type !== "recovery") {
      setError("El enlace no es válido o ya venció.");
      setReady(true);
      return;
    }

    setTokenHash(hash);
    setReady(true);
  }, []);

  async function handleConfirm() {
    setConfirming(true);
    setError("");

    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

    if (verifyError) {
      setError("El enlace no es válido o ya venció.");
      setConfirming(false);
      return;
    }

    router.replace("/crear-contrasena");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] px-5 py-6 text-[#f7f3ed] selection:bg-[#ff3b24] selection:text-white md:px-8 xl:px-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-[260px] -top-[280px] h-[680px] w-[680px] rounded-full bg-[#ff2a1a]/[0.11] blur-[185px]" />
        <div className="absolute -left-[280px] top-[15%] h-[700px] w-[700px] rounded-full bg-[#ff5a2a]/[0.05] blur-[190px]" />
        <div className="absolute inset-0 opacity-[0.033] [background-image:radial-gradient(rgba(255,255,255,.9)_0.6px,transparent_0.8px)] [background-size:5px_5px]" />
      </div>

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-[1480px] items-center justify-center">
        <div className="mx-auto w-full max-w-[470px] border border-white/[0.09] bg-[#080706]/90 shadow-[0_30px_120px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-2xl">
          <div className="border-b border-white/[0.08] p-6 text-center sm:p-8">
            <div className="relative mx-auto h-12 w-12 border border-white/[0.10] bg-white/[0.03]">
              <div className="absolute inset-[5px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_22px_rgba(255,59,36,.2)]" />
              <div className="absolute inset-[8px] rounded-[45%_55%_65%_35%] bg-[radial-gradient(circle_at_28%_24%,rgba(255,255,255,.45),transparent_28%)]" />
            </div>
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.38em] text-[#ff6a4f]">
              Capital Pass
            </p>
          </div>

          {!ready ? (
            <div className="p-6 py-16 text-center sm:p-8">
              <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-[#ff3b24]/20 border-t-[#ff3b24]" />
              <p className="mt-4 text-sm text-white/40">Verificando enlace...</p>
            </div>
          ) : error ? (
            <div className="p-6 sm:p-8">
              <div className="border border-red-500/30 bg-red-500/10 p-5 text-center text-sm font-bold leading-6 text-red-200">
                {error}
              </div>
              <Link
                href="/recuperar-contrasena"
                className="mt-6 flex h-12 w-full items-center justify-center border border-white/10 text-sm font-medium text-white/55 transition hover:border-white/25 hover:text-white"
              >
                Pedir un enlace nuevo
              </Link>
            </div>
          ) : (
            <>
              <div className="border-t border-white/[0.08] p-6 sm:p-8">
                <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#f7f3ed]/35">
                  Último paso
                </p>
                <h2 className="mt-4 text-[clamp(34px,8vw,50px)] font-black uppercase leading-[0.88] tracking-[-0.05em] text-[#f7f3ed]">
                  Confirmá que sos vos.
                </h2>
                <p className="mt-5 text-sm leading-7 text-[#f7f3ed]/45">
                  Por seguridad, confirmá manualmente para crear tu nueva contraseña.
                </p>
              </div>

              <div className="border-t border-white/[0.08] p-6 sm:p-8">
                {error && (
                  <div className="mb-5 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold leading-6 text-red-200">
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  disabled={confirming}
                  onClick={handleConfirm}
                  className="h-14 w-full bg-[#ff3b24] px-6 text-[11px] font-black uppercase tracking-[0.24em] text-white shadow-[0_18px_50px_rgba(255,59,36,.22)] transition hover:bg-[#ff4a32] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {confirming ? "Confirmando..." : "Continuar"}
                </button>
              </div>
            </>
          )}

          <div className="border-t border-white/[0.08] px-6 py-5 text-center sm:px-8">
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[#f7f3ed]/22">
              Acceso privado · Capital Pass
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
