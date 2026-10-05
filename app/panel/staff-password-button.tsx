"use client";

import { useState } from "react";
import { normalizeWhatsAppNumber } from "../../lib/whatsapp/phone";

type Credentials = {
  email: string;
  password: string;
  phone: string | null;
  loginUrl: string;
};

const ROLE_LABEL: Record<string, string> = {
  rrpp: "RRPP",
  controller: "controlador",
  door_seller: "vendedor de puerta",
  bartender: "bartender",
};

// Boton "Nueva contraseña" para alguien del equipo (RRPP, controlador,
// puerta, bartender). Genera una contraseña nueva -- la vieja no se puede
// reenviar, Supabase solo guarda el hash -- y la muestra con un boton para
// mandarsela por WhatsApp. Lo usan el panel del organizador
// (/api/equipo/contrasena) y el admin (/api/admin/equipo/contrasena).
export default function StaffPasswordButton({
  memberId,
  name,
  role,
  endpoint = "/api/equipo/contrasena",
  className,
}: {
  memberId: string;
  name: string;
  role: string;
  endpoint?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (busy) return;
    if (!window.confirm(`¿Generar una contraseña nueva para ${name}? La que tenía deja de funcionar en ese momento.`)) return;

    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "No se pudo generar la contraseña.");
      setCredentials({ email: data.email, password: data.password, phone: data.phone ?? null, loginUrl: data.loginUrl });
      setPhoneInput(data.phone ?? "");
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  const message = credentials
    ? [
        `Hola ${name}! Te dejo tus datos para entrar a Capital Pass como ${ROLE_LABEL[role] ?? "parte del equipo"}:`,
        "",
        `Usuario: ${credentials.email}`,
        `Contraseña: ${credentials.password}`,
        "",
        `Entrá desde: ${credentials.loginUrl}`,
      ].join("\n")
    : "";

  const whatsappNumber = normalizeWhatsAppNumber(phoneInput);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void generate()}
        aria-label={`Generar contraseña nueva para ${name}`}
        className={
          className ??
          "inline-flex min-h-[40px] shrink-0 items-center justify-center border border-white/[0.09] bg-white/[0.02] px-4 py-2 text-[9px] font-black uppercase tracking-[0.13em] text-white/65 transition hover:border-[#ff5a2a]/30 hover:text-white disabled:opacity-40"
        }
      >
        {busy ? "..." : "🔑 Contraseña"}
      </button>

      {error && !credentials && (
        <div className="fixed inset-x-4 bottom-4 z-[110] mx-auto max-w-md border border-red-400/20 bg-[#1a0907] px-4 py-3 text-sm text-red-200 shadow-xl" role="alert">
          <div className="flex items-start justify-between gap-3">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")} className="text-white/50 hover:text-white" aria-label="Cerrar">×</button>
          </div>
        </div>
      )}

      {credentials && (
        <div className="fixed inset-0 z-[110] overflow-y-auto bg-black/80 px-4 py-6 backdrop-blur-sm">
          <div className="flex min-h-full items-center justify-center">
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-md border border-[#ff5a2a]/20 bg-[linear-gradient(145deg,#110e0c,#090807)] p-5 text-left text-[#f7f3ed] shadow-[0_30px_120px_rgba(255,42,26,.12)] sm:p-6"
            >
              <p className="text-[9px] font-black uppercase tracking-[0.20em] text-[#ff7958]">Contraseña nueva</p>
              <h2 className="mt-3 break-words text-2xl font-black uppercase leading-tight tracking-[-0.04em]">{name}</h2>
              <p className="mt-2 text-sm leading-6 text-white/50">
                Ya quedó activa. Mandásela ahora: por seguridad no se vuelve a mostrar.
              </p>

              <div className="mt-5 space-y-3 border border-white/[0.08] bg-black/30 p-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/40">Usuario</p>
                  <p className="mt-1 break-all text-sm font-bold">{credentials.email}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/40">Contraseña</p>
                  <p className="mt-1 select-all font-mono text-xl font-black tracking-[0.06em] text-[#ffb199]">{credentials.password}</p>
                </div>
              </div>

              <label className="mt-5 block">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/60">WhatsApp</span>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="Ej: 3468 529047"
                  className="mt-2 h-12 w-full border border-white/[0.09] bg-black/25 px-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#ff5a2a]/60"
                />
                {phoneInput && !whatsappNumber && (
                  <span className="mt-2 block text-xs text-amber-300">Revisá el número: tiene que ser un celular argentino con código de área.</span>
                )}
                {!credentials.phone && !phoneInput && (
                  <span className="mt-2 block text-xs text-white/40">No tenía teléfono cargado. Escribilo para mandarle el WhatsApp.</span>
                )}
              </label>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <a
                  href={whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}` : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!whatsappNumber}
                  className={`inline-flex h-12 items-center justify-center border px-4 text-[10px] font-black uppercase tracking-[0.14em] transition ${
                    whatsappNumber
                      ? "border-emerald-400/25 bg-emerald-400/[0.09] text-emerald-200 hover:bg-emerald-400/[0.15]"
                      : "pointer-events-none border-white/[0.08] text-white/25"
                  }`}
                >
                  Enviar por WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="inline-flex h-12 items-center justify-center border border-white/[0.12] px-4 text-[10px] font-black uppercase tracking-[0.14em] text-white/70 transition hover:text-white"
                >
                  {copied ? "¡Copiado!" : "Copiar mensaje"}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setCredentials(null)}
                className="mt-3 h-11 w-full text-[10px] font-black uppercase tracking-[0.14em] text-white/45 transition hover:text-white"
              >
                Listo, cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
