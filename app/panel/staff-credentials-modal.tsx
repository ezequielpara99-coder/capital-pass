"use client";

import { useState } from "react";
import { normalizeWhatsAppNumber } from "../../lib/whatsapp/phone";

// Mismo formato que lib/staff/credentials.ts (StaffCredentials).
export type StaffCredentials = {
  name: string;
  role: string;
  email: string;
  username: string | null;
  phone: string | null;
  password: string;
  loginUrl: string;
};

const ROLE_LABEL: Record<string, string> = {
  rrpp: "RRPP",
  controller: "controlador",
  door_seller: "vendedor de puerta",
  bartender: "bartender",
};

export function staffCredentialsMessage(credentials: StaffCredentials) {
  const ways = [credentials.username ? `tu usuario *${credentials.username}*` : null, `tu email *${credentials.email}*`, credentials.phone ? "tu celular" : null]
    .filter(Boolean)
    .join(", ")
    .replace(/, ([^,]*)$/, " o $1");
  return [
    `Hola ${credentials.name}! Ya tenés tu acceso a Capital Pass como ${ROLE_LABEL[credentials.role] ?? "parte del equipo"}.`,
    "",
    `Entrá desde: ${credentials.loginUrl}`,
    `Podés ingresar con ${ways}.`,
    `Contraseña: *${credentials.password}*`,
  ].join("\n");
}

// Popup con los datos de acceso de alguien del equipo, recien creado o con
// una contraseña nueva, y el boton para mandarselos por WhatsApp. La
// contraseña no se guarda en ningun lado legible: se muestra una sola vez.
export default function StaffCredentialsModal({
  credentials,
  title,
  onClose,
}: {
  credentials: StaffCredentials;
  title: string;
  onClose: () => void;
}) {
  const [phoneInput, setPhoneInput] = useState(credentials.phone ?? "");
  const [copied, setCopied] = useState(false);
  const message = staffCredentialsMessage(credentials);
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
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-black/80 px-4 py-6 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          className="w-full max-w-md border border-[#ff5a2a]/20 bg-[linear-gradient(145deg,#110e0c,#090807)] p-5 text-left text-[#f7f3ed] shadow-[0_30px_120px_rgba(255,42,26,.12)] sm:p-6"
        >
          <p className="text-[9px] font-black uppercase tracking-[0.20em] text-[#ff7958]">{title}</p>
          <h2 className="mt-3 break-words text-2xl font-black uppercase leading-tight tracking-[-0.04em]">{credentials.name}</h2>
          <p className="mt-2 text-sm leading-6 text-white/50">
            Mandale estos datos ahora: por seguridad la contraseña no se vuelve a mostrar.
          </p>

          <div className="mt-5 space-y-3 border border-white/[0.08] bg-black/30 p-4">
            {credentials.username && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/40">Usuario</p>
                <p className="mt-1 select-all break-all text-sm font-bold">{credentials.username}</p>
              </div>
            )}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/40">Email</p>
              <p className="mt-1 break-all text-sm font-bold">{credentials.email}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/40">Contraseña</p>
              <p className="mt-1 select-all font-mono text-xl font-black tracking-[0.06em] text-[#ffb199]">{credentials.password}</p>
            </div>
            <p className="text-xs leading-5 text-white/40">
              Puede ingresar con el usuario, el email{credentials.phone ? " o su celular" : ""}.
            </p>
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
              <span className="mt-2 block text-xs text-white/40">No tiene celular cargado. Escribilo para mandarle el WhatsApp.</span>
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
            onClick={onClose}
            className="mt-3 h-11 w-full text-[10px] font-black uppercase tracking-[0.14em] text-white/45 transition hover:text-white"
          >
            Listo, cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
