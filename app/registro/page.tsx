"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "../../lib/supabase/client";

export default function RegisterPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    if (form.get("password") !== form.get("confirm_password")) { setError("Las contraseñas no coinciden."); return; }
    setBusy(true); setError("");
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: value("email").toLowerCase(), password: String(form.get("password")),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { first_name: value("first_name"), last_name: value("last_name"), organization_name: value("organization_name") },
        },
      });
      if (signUpError) throw new Error(signUpError.code === "user_already_exists"
        ? "Ya existe una cuenta con ese email. Iniciá sesión."
        : "No pudimos crear la cuenta. Revisá tus datos o reintentá en unos minutos.");
      if (data.session) { window.location.replace("/cuenta"); return; }
      setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos crear la cuenta."); }
    finally { setBusy(false); }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] px-5 py-6 text-[#f7f3ed] selection:bg-[#ff3b24] selection:text-white md:px-8 xl:px-10">
      {/* FONDO — espejo de login: luz arriba-derecha */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-[260px] -top-[280px] h-[680px] w-[680px] rounded-full bg-[#ff2a1a]/[0.11] blur-[185px]" />

        <div className="absolute -left-[280px] top-[15%] h-[700px] w-[700px] rounded-full bg-[#ff5a2a]/[0.08] blur-[190px]" />

        <div className="absolute bottom-[-350px] right-[25%] h-[650px] w-[820px] rounded-[50%] bg-[radial-gradient(ellipse_at_top,rgba(255,124,76,.18)_0%,rgba(255,59,36,.09)_25%,rgba(76,14,7,.06)_50%,transparent_72%)] blur-[40px]" />

        <div className="absolute inset-0 opacity-[0.033] [background-image:radial-gradient(rgba(255,255,255,.9)_0.6px,transparent_0.8px)] [background-size:5px_5px]" />
      </div>

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-[1480px] items-center">
        <div className="grid w-full items-center gap-10 lg:grid-cols-[470px_minmax(0,1fr)] xl:gap-16">
          {/* CARD — a la izquierda, espejo de login */}
          <div className="mx-auto w-full max-w-[470px] border border-white/[0.09] bg-[#080706]/90 shadow-[0_30px_120px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-2xl lg:order-1 lg:mx-0">
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
                    Nueva cuenta
                  </p>
                </div>
              </div>

              <div className="mt-10">
                <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#f7f3ed]/35">
                  Registro
                </p>

                <h2 className="mt-4 text-[clamp(38px,9vw,56px)] font-black uppercase leading-[0.84] tracking-[-0.05em] text-[#f7f3ed]">
                  Creá tu cuenta.
                </h2>

                <p className="mt-5 text-sm leading-7 text-[#f7f3ed]/45">
                  Registrarte es gratis. Después podés activar el servicio
                  con una suscripción.
                </p>
              </div>
            </div>

            {sent ? (
              <div className="p-6 sm:p-8">
                <div className="mx-auto flex h-14 w-14 items-center justify-center border border-emerald-400/25 bg-emerald-400/[0.08] text-xl text-emerald-300">
                  ✓
                </div>

                <h3 className="mt-5 text-center text-2xl font-black uppercase tracking-[-0.03em]">
                  Revisá tu correo
                </h3>

                <p className="mt-3 text-center text-sm leading-6 text-[#f7f3ed]/45">
                  Si el registro está disponible para ese email, recibirás
                  un enlace para confirmar tu cuenta. Revisá también la
                  carpeta de spam.
                </p>

                <Link
                  href="/login"
                  className="mt-6 flex h-14 w-full items-center justify-center border border-white/10 text-sm font-bold text-white/70 transition hover:border-white/25 hover:text-white"
                >
                  Ir a iniciar sesión
                </Link>
              </div>
            ) : (
              <form onSubmit={register} className="p-6 sm:p-8">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field name="first_name" label="Nombre" autoComplete="given-name" />
                  <Field name="last_name" label="Apellido" autoComplete="family-name" />
                </div>

                <div className="mt-5">
                  <Field name="organization_name" label="Nombre de la organización" autoComplete="organization" />
                </div>

                <div className="mt-5">
                  <Field name="email" label="Email" type="email" autoComplete="email" />
                </div>

                <div className="mt-5">
                  <Field name="password" label="Contraseña (mínimo 8 caracteres)" type="password" autoComplete="new-password" />
                </div>

                <div className="mt-5">
                  <Field name="confirm_password" label="Repetí la contraseña" type="password" autoComplete="new-password" />
                </div>

                {error && (
                  <div className="mt-5 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold leading-6 text-red-200">
                    {error}
                  </div>
                )}

                <button
                  disabled={busy}
                  className="cp-punch mt-7 h-14 w-full bg-[#ff3b24] px-6 text-[11px] font-black uppercase tracking-[0.24em] text-white shadow-[0_18px_50px_rgba(255,59,36,.3)] transition hover:scale-[1.01] hover:bg-[#ff4a32] hover:shadow-[0_22px_65px_rgba(255,59,36,.4)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {busy ? "Creando cuenta..." : "Crear cuenta"}
                </button>

                <p className="mt-6 text-center text-sm text-white/65">
                  ¿Ya tenés cuenta? <Link href="/login" className="text-white underline">Iniciá sesión</Link>
                </p>
              </form>
            )}

            <div className="border-t border-white/[0.08] px-6 py-5 text-center sm:px-8">
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[#f7f3ed]/22">
                Acceso privado · Capital Pass
              </p>
            </div>
          </div>

          {/* BLOQUE EDITORIAL — a la derecha, espejo de login */}
          <div className="hidden lg:order-2 lg:block">
            <div className="inline-flex items-center border border-[#ff3b24]/35 bg-[#ff3b24]/[0.08] px-4 py-3">
              <span className="mr-3 h-2 w-2 rounded-full bg-[#ff3b24]" />

              <span className="text-[10px] font-black uppercase tracking-[0.38em] text-[#ffb29f]">
                Capital Pass Access
              </span>
            </div>

            <h1 className="mt-8 max-w-[790px] bg-gradient-to-bl from-[#fff2ea] via-[#ff8c69] to-[#ff2a1a] bg-clip-text text-[clamp(58px,7.5vw,118px)] font-black uppercase leading-[0.82] tracking-[-0.075em] text-transparent">
              Empezá a operar tu evento.
            </h1>

            <p className="mt-7 max-w-[520px] text-base leading-8 text-[#f7f3ed]/45">
              Creá tu cuenta gratis y activá el servicio cuando quieras con
              una suscripción. Vos administrás tandas, RRPP, accesos y
              ventas desde un mismo lugar.
            </p>

            <div className="mt-12 grid max-w-[760px] grid-cols-3 border border-white/[0.08]">
              {[
                ["01", "Cuenta gratis"],
                ["02", "Suscripción"],
                ["03", "Tu panel"],
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
        </div>
      </section>
    </main>
  );
}

function Field({ name, label, type = "text", autoComplete }: { name: string; label: string; type?: string; autoComplete: string }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.26em] text-[#f7f3ed]/55">
        {label}
      </span>

      <input
        name={name}
        type={type}
        required
        minLength={type === "password" ? 8 : 1}
        maxLength={type === "password" ? 128 : 200}
        autoComplete={autoComplete}
        className="mt-3 h-14 w-full border border-white/[0.10] bg-black/25 px-4 text-sm font-semibold text-[#f7f3ed] outline-none transition placeholder:text-[#f7f3ed]/20 focus:border-[#ff3b24]/70 focus:ring-4 focus:ring-[#ff3b24]/10"
      />
    </label>
  );
}
