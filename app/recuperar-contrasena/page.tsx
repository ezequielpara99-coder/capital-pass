"use client";

import {
  FormEvent,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import { createRecoveryClient } from "../../lib/supabase/client";

// ============================================================
// RECUPERAR CONTRASEÑA
// ============================================================

export const dynamic = "force-dynamic";

export default function RecoverPasswordPage() {
  const supabase =
    useMemo(
      () => createRecoveryClient(),
      []
    );

  const [
    email,
    setEmail,
  ] =
    useState("");

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
    sent,
    setSent,
  ] =
    useState(false);

  // ==========================================================
  // ENVIAR EMAIL
  // ==========================================================

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const cleanEmail =
        email
          .trim()
          .toLowerCase();

      if (!cleanEmail) {
        throw new Error(
          "Ingresá tu email."
        );
      }

      // ------------------------------------------------------
      // IMPORTANTE:
      //
      // Le indicamos expresamente a Supabase que,
      // después de tocar el enlace del correo,
      // vuelva a nuestra pantalla para crear la contraseña.
      // ------------------------------------------------------

      const redirectTo =
        `${window.location.origin}/crear-contrasena`;

      const {
        error:
          resetError,
      } =
        await supabase.auth.resetPasswordForEmail(
          cleanEmail,
          {
            redirectTo,
          }
        );

      if (resetError) {
        console.error(
          "ERROR RESET PASSWORD:",
          resetError
        );

        throw new Error(
          "No pudimos enviar el correo de recuperación."
        );
      }

      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error."
      );
    } finally {
      setLoading(false);
    }
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] px-5 py-6 text-[#f7f3ed] selection:bg-[#ff3b24] selection:text-white md:px-8 xl:px-10">
      {/* FONDO — luz arriba-izquierda, hereda la orientación de login */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-[260px] -top-[280px] h-[680px] w-[680px] rounded-full bg-[#ff2a1a]/[0.11] blur-[185px]" />

        <div className="absolute -right-[280px] top-[15%] h-[700px] w-[700px] rounded-full bg-[#ff5a2a]/[0.05] blur-[190px]" />

        <div className="absolute inset-0 opacity-[0.033] [background-image:radial-gradient(rgba(255,255,255,.9)_0.6px,transparent_0.8px)] [background-size:5px_5px]" />
      </div>

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-[1480px] items-center justify-center">
        <div className="mx-auto w-full max-w-[470px] border border-white/[0.09] bg-[#080706]/90 shadow-[0_30px_120px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-2xl">
          {/* LOGO */}
          <div className="border-b border-white/[0.08] p-6 text-center sm:p-8">
            <div className="relative mx-auto h-12 w-12 border border-white/[0.10] bg-white/[0.03]">
              <div className="absolute inset-[5px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_22px_rgba(255,59,36,.2)]" />

              <div className="absolute inset-[8px] rounded-[45%_55%_65%_35%] bg-[radial-gradient(circle_at_28%_24%,rgba(255,255,255,.45),transparent_28%)]" />
            </div>

            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.38em] text-[#ff6a4f]">
              Capital Pass
            </p>

            <p className="mt-1 text-sm font-black uppercase tracking-[-0.02em] text-[#f7f3ed]/45">
              Gestión inteligente de eventos
            </p>
          </div>

          {sent ? (
            <div className="p-6 sm:p-8">
              <div className="mx-auto flex h-14 w-14 items-center justify-center border border-emerald-400/25 bg-emerald-400/[0.08] text-xl text-emerald-300">
                ✓
              </div>

              <div className="mt-6 text-center">
                <h2 className="text-[clamp(30px,7vw,42px)] font-black uppercase leading-[0.9] tracking-[-0.04em]">
                  Revisá tu correo
                </h2>

                <p className="mt-3 text-sm leading-6 text-[#f7f3ed]/45">
                  Si existe una cuenta asociada a ese email, vas a recibir un
                  enlace para crear una nueva contraseña.
                </p>
              </div>

              <div className="mt-6 border border-[#ff3b24]/15 bg-[#ff3b24]/[0.05] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f7f3ed]/40">
                  Email
                </p>

                <p className="mt-1 break-all text-sm font-semibold text-[#ffb29f]">
                  {email.trim()}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setError("");
                }}
                className="mt-7 h-14 w-full bg-[#ff3b24] px-6 text-[11px] font-black uppercase tracking-[0.24em] text-white shadow-[0_18px_50px_rgba(255,59,36,.22)] transition hover:bg-[#ff4a32] active:scale-[0.99]"
              >
                Enviar nuevamente
              </button>

              <Link
                href="/login"
                className="mt-3 flex h-12 w-full items-center justify-center border border-white/10 text-sm font-medium text-white/55 transition hover:border-white/25 hover:text-white"
              >
                Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <>
              <div className="p-6 sm:p-8">
                <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#f7f3ed]/35">
                  Acceso privado
                </p>

                <h2 className="mt-4 text-[clamp(38px,9vw,56px)] font-black uppercase leading-[0.84] tracking-[-0.05em] text-[#f7f3ed]">
                  Recuperar contraseña.
                </h2>

                <p className="mt-5 text-sm leading-7 text-[#f7f3ed]/45">
                  Ingresá el email de tu cuenta y te enviaremos un enlace
                  para crear una contraseña nueva.
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className="border-t border-white/[0.08] p-6 sm:p-8"
              >
                <label className="text-[10px] font-black uppercase tracking-[0.26em] text-[#f7f3ed]/55">
                  Email
                </label>

                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="tu@email.com"
                  className="mt-3 h-14 w-full border border-white/[0.10] bg-black/25 px-4 text-sm font-semibold text-[#f7f3ed] outline-none transition placeholder:text-[#f7f3ed]/20 focus:border-[#ff3b24]/70 focus:ring-4 focus:ring-[#ff3b24]/10"
                />

                {error && (
                  <div className="mt-5 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold leading-6 text-red-200">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="mt-7 h-14 w-full bg-[#ff3b24] px-6 text-[11px] font-black uppercase tracking-[0.24em] text-white shadow-[0_18px_50px_rgba(255,59,36,.22)] transition hover:bg-[#ff4a32] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {loading ? "Enviando..." : "Enviar enlace"}
                </button>

                <div className="mt-6 text-center">
                  <Link
                    href="/login"
                    className="text-xs font-bold text-[#ff9a83] underline decoration-[#ff3b24]/35 underline-offset-4 transition hover:text-white"
                  >
                    ← Volver al inicio de sesión
                  </Link>
                </div>
              </form>
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
