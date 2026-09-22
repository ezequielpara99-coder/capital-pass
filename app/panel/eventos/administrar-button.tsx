"use client";

import { useState } from "react";

// "Administrar" selecciona este evento (mismo endpoint que el selector de
// evento del panel) y va al panel general del organizador -- no a la
// pantalla de identidad visual/tandas. Asi el organizador entra directo a
// ver los datos (ventas, entradas, RRPPs...) de ESE evento en particular.
export default function AdministrarButton({ eventId }: { eventId: string }) {
  const [busy, setBusy] = useState(false);

  async function administrar() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/panel/evento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (!response.ok) throw new Error();
      window.location.assign("/panel");
    } catch {
      // Si algo falla, igual llevamos al panel general -- pickSelectedEvent
      // ahi elige un evento razonable por su cuenta.
      window.location.assign("/panel");
    }
  }

  return (
    <button
      type="button"
      onClick={administrar}
      disabled={busy}
      className="flex h-11 items-center justify-between bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] px-4 text-[9px] font-black uppercase tracking-[0.13em] text-white transition hover:brightness-110 disabled:opacity-60"
    >
      <span>{busy ? "Entrando…" : "Administrar"}</span>
      <span className="text-sm">→</span>
    </button>
  );
}
