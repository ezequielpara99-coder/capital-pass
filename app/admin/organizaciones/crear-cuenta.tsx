"use client";

import { FormEvent, useState } from "react";

type Created = { email: string; password: string; loginUrl: string; firstName: string; organizationName: string };

const INPUT =
  "mt-2 h-12 w-full border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50";
const LABEL = "block text-[9px] font-black uppercase tracking-[0.18em] text-white/40";

export default function CrearCuenta() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  function close() {
    setOpen(false);
    setError("");
    setCreated(null);
    setCopied(false);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const firstName = String(form.get("firstName") ?? "").trim();
    const organizationName = String(form.get("organizationName") ?? "").trim();

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/cuentas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName: form.get("lastName"),
          email: form.get("email"),
          organizationName,
          password: form.get("password"),
          note: form.get("note"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo crear la cuenta.");
      setCreated({ email: result.email, password: result.password, loginUrl: result.loginUrl, firstName, organizationName });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta.");
    } finally {
      setBusy(false);
    }
  }

  async function copyMessage() {
    if (!created) return;
    const text =
      `Hola ${created.firstName}! Ya tenés tu cuenta de Capital Pass (${created.organizationName}), con todo el pack incluido.\n\n` +
      `Ingresá acá: ${created.loginUrl}\n` +
      `Email: ${created.email}\n` +
      `Contraseña: ${created.password}\n\n` +
      `Si querés cambiar la contraseña, usá "¿Olvidaste tu contraseña?" en el login.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("No se pudo copiar. Copiá los datos manualmente.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-12 items-center bg-[#ff2a1a] px-6 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-[0_14px_40px_rgba(255,42,26,.25)] transition hover:bg-[#ff4a2d]"
      >
        + Crear cuenta gratis
      </button>

      {open && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <button type="button" aria-label="Cerrar" onClick={close} className="absolute inset-0 cursor-default bg-black/80 backdrop-blur-md" />

          <div className="relative z-10 max-h-[92vh] w-full max-w-[520px] overflow-y-auto border border-white/[0.10] bg-[#0a0908] p-6 shadow-[0_30px_90px_rgba(0,0,0,.6)] md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Cuenta de cortesía</p>
                <h2 className="mt-2 text-2xl font-black uppercase tracking-[-0.03em]">
                  {created ? "Cuenta creada" : "Crear cuenta"}
                </h2>
              </div>
              <button type="button" onClick={close} className="flex h-10 w-10 items-center justify-center border border-white/[0.10] text-xl text-white/50">
                ×
              </button>
            </div>

            {created ? (
              <div className="mt-6">
                <p className="text-sm leading-6 text-white/50">
                  Ya puede ingresar con todo el pack, sin pagar. Pasale estos datos — la contraseña no se vuelve a mostrar.
                </p>

                <dl className="mt-5 space-y-3 border border-white/[0.08] bg-black/30 p-5 text-sm">
                  <div>
                    <dt className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30">Ingreso</dt>
                    <dd className="mt-1 break-all font-bold text-white/80">{created.loginUrl}</dd>
                  </div>
                  <div>
                    <dt className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30">Email</dt>
                    <dd className="mt-1 break-all font-bold text-white/80">{created.email}</dd>
                  </div>
                  <div>
                    <dt className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30">Contraseña</dt>
                    <dd className="mt-1 font-mono text-lg font-black text-[#ffc0ad]">{created.password}</dd>
                  </div>
                </dl>

                {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={copyMessage}
                    className="h-12 bg-[#ff2a1a] px-5 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d]"
                  >
                    {copied ? "¡Copiado!" : "Copiar mensaje"}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="flex h-12 items-center justify-center border border-white/[0.12] px-5 text-[10px] font-black uppercase tracking-[0.16em] text-white/60 transition hover:text-white"
                  >
                    Actualizar lista
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={LABEL}>
                    Nombre
                    <input name="firstName" required className={INPUT} />
                  </label>
                  <label className={LABEL}>
                    Apellido
                    <input name="lastName" className={INPUT} />
                  </label>
                </div>

                <label className={LABEL}>
                  Email
                  <input name="email" type="email" required className={INPUT} placeholder="cliente@mail.com" />
                </label>

                <label className={LABEL}>
                  Nombre de la organización / marca
                  <input name="organizationName" required className={INPUT} />
                </label>

                <label className={LABEL}>
                  Contraseña <span className="text-white/20">(vacío = se genera una)</span>
                  <input name="password" type="text" autoComplete="off" className={INPUT} placeholder="Mínimo 8 caracteres" />
                </label>

                <label className={LABEL}>
                  Nota interna <span className="text-white/20">(opcional)</span>
                  <input name="note" className={INPUT} placeholder="Ej: cliente del estudio" />
                </label>

                {error && <p className="border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

                <button
                  type="submit"
                  disabled={busy}
                  className="h-13 w-full bg-[#ff2a1a] py-4 text-[10px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-[#ff4a2d] disabled:opacity-50"
                >
                  {busy ? "Creando..." : "Crear cuenta"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
