"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "../../lib/supabase/client";

export default function LoginPage() {
  const supabase = useMemo(
    () => createClient(),
    []
  );

  const [email, setEmail] =
    useState("");
  const [password, setPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);
  const [loading, setLoading] =
    useState(false);
  const [error, setError] =
    useState("");

  // La PWA abre siempre en /login (start_url del manifest). Sin esto,
  // alguien con sesion activa que abre el icono de la app instalada cae
  // en el formulario de login en vez de ir directo a su panel.
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) window.location.replace("/cuenta");
    });
  }, [supabase]);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(), password,
      });
      if (authError || !data.user) {
        throw new Error(authError?.code === "email_not_confirmed"
          ? "Confirmá tu email desde el enlace que recibiste por correo."
          : "Email o contraseña incorrectos.");
      }
      window.location.replace("/cuenta");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] px-5 py-6 text-[#f7f3ed] selection:bg-[#ff3b24] selection:text-white md:px-8 xl:px-10">
      {/* FONDO */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-[260px] -top-[280px] h-[680px] w-[680px] rounded-full bg-[#ff2a1a]/[0.11] blur-[185px]" />

        <div className="absolute -right-[280px] top-[15%] h-[700px] w-[700px] rounded-full bg-[#ff5a2a]/[0.08] blur-[190px]" />

        <div className="absolute bottom-[-350px] left-[25%] h-[650px] w-[820px] rounded-[50%] bg-[radial-gradient(ellipse_at_top,rgba(255,124,76,.18)_0%,rgba(255,59,36,.09)_25%,rgba(76,14,7,.06)_50%,transparent_72%)] blur-[40px]" />

        <div className="absolute inset-0 opacity-[0.033] [background-image:radial-gradient(rgba(255,255,255,.9)_0.6px,transparent_0.8px)] [background-size:5px_5px]" />
      </div>

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-[1480px] items-center">
        <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1fr)_470px] xl:gap-16">
          {/* BLOQUE EDITORIAL */}
          <div className="hidden lg:block">
            <div className="inline-flex items-center border border-[#ff3b24]/35 bg-[#ff3b24]/[0.08] px-4 py-3">
              <span className="mr-3 h-2 w-2 rounded-full bg-[#ff3b24]" />

              <span className="text-[10px] font-black uppercase tracking-[0.38em] text-[#ffb29f]">
                Capital Pass Access
              </span>
            </div>

            <h1 className="mt-8 max-w-[790px] bg-gradient-to-br from-[#fff2ea] via-[#ff8c69] to-[#ff2a1a] bg-clip-text text-[clamp(58px,7.5vw,118px)] font-black uppercase leading-[0.82] tracking-[-0.075em] text-transparent">
              Entrá a tu evento.
            </h1>

            <p className="mt-7 max-w-[520px] text-base leading-8 text-[#f7f3ed]/45">
              Acceso seguro para organizadores, RRPPs,
              controladores y venta en puerta. Cada rol entra
              directo a su área de trabajo.
            </p>

            <div className="mt-12 grid max-w-[760px] grid-cols-3 border border-white/[0.08]">
              {[
                ["01", "Organizadores"],
                ["02", "RRPPs"],
                ["03", "Accesos"],
              ].map(([number, label]) => (
                <div
                  key={label}
                  className="border-r border-white/[0.08] p-5 last:border-r-0"
                >
                  <p className="text-[11px] font-black text-[#ff3b24]">
                    {number}
                  </p>

                  <p className="mt-4 text-[11px] font-black uppercase tracking-[0.22em] text-[#f7f3ed]/55">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* CARD */}
          <div className="mx-auto w-full max-w-[470px] border border-white/[0.09] bg-[#080706]/90 shadow-[0_30px_120px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-2xl">
            <div className="border-b border-white/[0.08] p-6 sm:p-8">
              {/* LOGO */}
              <div className="flex items-center gap-4">
                <div className="relative h-12 w-12 border border-white/[0.10] bg-white/[0.03]">
                  <div className="absolute inset-[5px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_22px_rgba(255,59,36,.2)]" />

                  <div className="absolute inset-[8px] rounded-[45%_55%_65%_35%] bg-[radial-gradient(circle_at_28%_24%,rgba(255,255,255,.45),transparent_28%)]" />
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.38em] text-[#ff6a4f]">
                    Capital Pass
                  </p>

                  <p className="mt-1 text-sm font-black uppercase tracking-[-0.03em] text-[#f7f3ed]">
                    Event Access
                  </p>
                </div>
              </div>

              {/* TITULO */}
              <div className="mt-10">
                <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#f7f3ed]/35">
                  Inicio de sesión
                </p>

                <h2 className="mt-4 text-[clamp(42px,10vw,64px)] font-black uppercase leading-[0.84] tracking-[-0.065em] text-[#f7f3ed]">
                  Bienvenido.
                </h2>

                <p className="mt-5 text-sm leading-7 text-[#f7f3ed]/45">
                  Ingresá con tu cuenta y te llevamos
                  automáticamente al panel que corresponde según
                  tu rol.
                </p>
              </div>
            </div>

            {/* FORM */}
            <form
              onSubmit={handleLogin}
              className="p-6 sm:p-8"
            >
              {/* EMAIL */}
              <label className="text-[10px] font-black uppercase tracking-[0.26em] text-[#f7f3ed]/55">
                Email
              </label>

              <input
                type="email"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                autoComplete="email"
                required
                placeholder="tu@email.com"
                className="mt-3 h-14 w-full border border-white/[0.10] bg-black/25 px-4 text-sm font-semibold text-[#f7f3ed] outline-none transition placeholder:text-[#f7f3ed]/20 focus:border-[#ff3b24]/70 focus:ring-4 focus:ring-[#ff3b24]/10"
              />

              {/* PASSWORD */}
              <div className="mt-6 flex items-center justify-between gap-4">
                <label className="text-[10px] font-black uppercase tracking-[0.26em] text-[#f7f3ed]/55">
                  Contraseña
                </label>

                <a
                  href="/recuperar-contrasena"
                  className="text-xs font-bold text-[#ff9a83] underline decoration-[#ff3b24]/35 underline-offset-4 transition hover:text-white"
                >
                  ¿Olvidaste tu contraseña?
                </a>
              </div>

              <div className="relative mt-3">
                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  autoComplete="current-password"
                  required
                  className="h-14 w-full border border-white/[0.10] bg-black/25 px-4 pr-14 text-sm font-semibold text-[#f7f3ed] outline-none transition focus:border-[#ff3b24]/70 focus:ring-4 focus:ring-[#ff3b24]/10"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (current) => !current
                    )
                  }
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-lg text-[#f7f3ed]/35 transition hover:text-white"
                  aria-label={
                    showPassword
                      ? "Ocultar contraseña"
                      : "Mostrar contraseña"
                  }
                >
                  {showPassword ? "◉" : "◌"}
                </button>
              </div>

              {/* ERROR */}
              {error && (
                <div className="mt-5 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold leading-6 text-red-200">
                  {error}
                </div>
              )}

              {/* BOTÓN */}
              <button
                type="submit"
                disabled={
                  loading ||
                  !email.trim() ||
                  !password
                }
                className="cp-punch mt-7 h-14 w-full bg-[#ff3b24] px-6 text-[11px] font-black uppercase tracking-[0.24em] text-white shadow-[0_18px_50px_rgba(255,59,36,.3)] transition hover:scale-[1.01] hover:bg-[#ff4a32] hover:shadow-[0_22px_65px_rgba(255,59,36,.4)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {loading
                  ? "Ingresando..."
                  : "Ingresar"}
              </button>
            </form>

            <div className="px-6 pb-6 text-center text-sm text-white/65">
              ¿No tenés cuenta? <a href="/registro" className="text-white underline">Crear cuenta</a>
            </div>
            {/* FOOTER */}
            <div className="border-t border-white/[0.08] px-6 py-5 text-center sm:px-8">
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[#f7f3ed]/22">
                Acceso privado · Capital Pass
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
