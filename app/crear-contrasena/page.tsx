"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createRecoveryClient } from "../../lib/supabase/client";

export const dynamic = "force-dynamic";

export default function CreatePasswordPage() {
  const router = useRouter();
  const [supabase] = useState(() => createRecoveryClient());

  const [checking, setChecking] = useState(true);
  const [validSession, setValidSession] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function initializeRecovery() {
      const url = new URL(window.location.href);

      const code =
        url.searchParams.get("code");

      // Si Supabase devuelve un código PKCE,
      // lo intercambiamos por una sesión.
      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(
            code
          );

        if (exchangeError) {
          setError(
            "El enlace no es válido o ya venció."
          );
          setChecking(false);
          return;
        }

        // Quitamos el código de la URL.
        window.history.replaceState(
          {},
          "",
          "/crear-contrasena"
        );
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError(
          "El enlace no es válido o ya venció."
        );
        setValidSession(false);
        setChecking(false);
        return;
      }

      setValidSession(true);
      setChecking(false);
    }

    initializeRecovery();
  }, [supabase]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    if (password.length < 8) {
      setError(
        "La contraseña debe tener al menos 8 caracteres."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError(
        "Las contraseñas no coinciden."
      );
      return;
    }

    setSaving(true);

    const { error: updateError } =
      await supabase.auth.updateUser({
        password,
      });

    if (updateError) {
      setError(
        "No se pudo guardar la contraseña."
      );
      setSaving(false);
      return;
    }

    await supabase.auth.signOut();

    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] px-5 py-6 text-[#f7f3ed] selection:bg-[#ff3b24] selection:text-white md:px-8 xl:px-10">
      {/* FONDO — luz arriba-derecha, cierra el espejo con registro */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-[260px] -top-[280px] h-[680px] w-[680px] rounded-full bg-[#ff2a1a]/[0.11] blur-[185px]" />

        <div className="absolute -left-[280px] top-[15%] h-[700px] w-[700px] rounded-full bg-[#ff5a2a]/[0.05] blur-[190px]" />

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
          </div>

          {checking ? (
            <div className="p-6 py-16 text-center sm:p-8">
              <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-[#ff3b24]/20 border-t-[#ff3b24]" />

              <p className="mt-4 text-sm text-white/40">
                Verificando enlace...
              </p>
            </div>
          ) : !validSession ? (
            <div className="p-6 sm:p-8">
              <div className="border border-red-500/30 bg-red-500/10 p-5 text-center text-sm font-bold leading-6 text-red-200">
                {error}
              </div>
            </div>
          ) : (
            <>
              <div className="border-t border-white/[0.08] p-6 sm:p-8">
                <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#f7f3ed]/35">
                  Último paso
                </p>

                <h2 className="mt-4 text-[clamp(38px,9vw,56px)] font-black uppercase leading-[0.84] tracking-[-0.05em] text-[#f7f3ed]">
                  Nueva contraseña.
                </h2>

                <p className="mt-5 text-sm leading-7 text-[#f7f3ed]/45">
                  Elegí una contraseña para acceder a Capital Pass.
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className="border-t border-white/[0.08] p-6 sm:p-8"
              >
                <label className="text-[10px] font-black uppercase tracking-[0.26em] text-[#f7f3ed]/55">
                  Nueva contraseña
                </label>

                <input
                  type="password"
                  required
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Mínimo 8 caracteres"
                  className="mt-3 h-14 w-full border border-white/[0.10] bg-black/25 px-4 text-sm font-semibold text-[#f7f3ed] outline-none transition placeholder:text-[#f7f3ed]/20 focus:border-[#ff3b24]/70 focus:ring-4 focus:ring-[#ff3b24]/10"
                />

                <label className="mt-6 block text-[10px] font-black uppercase tracking-[0.26em] text-[#f7f3ed]/55">
                  Repetir contraseña
                </label>

                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  placeholder="Repetí la contraseña"
                  className="mt-3 h-14 w-full border border-white/[0.10] bg-black/25 px-4 text-sm font-semibold text-[#f7f3ed] outline-none transition placeholder:text-[#f7f3ed]/20 focus:border-[#ff3b24]/70 focus:ring-4 focus:ring-[#ff3b24]/10"
                />

                {error && (
                  <div className="mt-5 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold leading-6 text-red-200">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="mt-7 h-14 w-full bg-[#ff3b24] px-6 text-[11px] font-black uppercase tracking-[0.24em] text-white shadow-[0_18px_50px_rgba(255,59,36,.22)] transition hover:bg-[#ff4a32] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {saving ? "Guardando..." : "Guardar contraseña"}
                </button>
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
