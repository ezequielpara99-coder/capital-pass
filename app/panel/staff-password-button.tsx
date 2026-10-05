"use client";

import { useState } from "react";
import StaffCredentialsModal, { type StaffCredentials } from "./staff-credentials-modal";

// Boton "Nueva contraseña" para alguien del equipo (RRPP, controlador,
// puerta, bartender). Genera una contraseña nueva -- la vieja no se puede
// reenviar, Supabase solo guarda el hash -- y la muestra con un boton para
// mandarsela por WhatsApp. Lo usan el panel del organizador
// (/api/equipo/contrasena) y el admin (/api/admin/equipo/contrasena).
export default function StaffPasswordButton({
  memberId,
  name,
  endpoint = "/api/equipo/contrasena",
  className,
}: {
  memberId: string;
  name: string;
  role?: string;
  endpoint?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState<StaffCredentials | null>(null);

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
      if (!response.ok || !data?.credentials) throw new Error(data?.error ?? "No se pudo generar la contraseña.");
      setCredentials(data.credentials as StaffCredentials);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar la contraseña.");
    } finally {
      setBusy(false);
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
        <StaffCredentialsModal credentials={credentials} title="Contraseña nueva" onClose={() => setCredentials(null)} />
      )}
    </>
  );
}
