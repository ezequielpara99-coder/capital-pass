"use client";

import { useState } from "react";

export default function CortesiaToggle({
  organizationId,
  initialComplimentary,
  initialNote,
}: {
  organizationId: string;
  initialComplimentary: boolean;
  initialNote: string | null;
}) {
  const [complimentary, setComplimentary] = useState(initialComplimentary);
  const [note, setNote] = useState(initialNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(next: boolean) {
    if (busy) return;
    // Activar cortesia le da a la organizacion el pack completo GRATIS,
    // sin vencimiento -- un click accidental en el boton equivocado no
    // deberia poder regalar el servicio sin querer.
    if (next && !window.confirm("¿Activar cortesía? Esta organización va a usar Capital Pass gratis, con el pack completo, sin vencimiento.")) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/cuentas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, complimentary: next, note }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar.");
      setComplimentary(next);
      if (!next) setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border-t border-white/[0.07] pt-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#ff7958]">Cuenta de cortesía</p>
          <p className="mt-2 max-w-[520px] text-sm leading-6 text-white/40">
            {complimentary
              ? "Usa Capital Pass gratis y con el pack completo (stock y barras incluidos), sin vencimiento."
              : "Activala para que esta organización use todo gratis, sin pagar suscripción."}
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void save(!complimentary)}
          className={`h-11 px-5 text-[10px] font-black uppercase tracking-[0.16em] transition disabled:opacity-50 ${
            complimentary
              ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
              : "bg-[#ff2a1a] text-white hover:bg-[#ff4a2d]"
          }`}
        >
          {busy ? "Guardando..." : complimentary ? "✓ Cortesía activa · quitar" : "Activar cortesía"}
        </button>
      </div>

      {complimentary && (
        <label className="mt-4 block max-w-[520px] text-[9px] font-black uppercase tracking-[0.18em] text-white/30">
          Nota interna
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => void save(true)}
            placeholder="Ej: cliente del estudio"
            className="mt-2 h-11 w-full border border-white/[0.12] bg-black/30 px-4 text-sm normal-case tracking-normal text-white outline-none focus:border-[#ff5a2a]/50"
          />
        </label>
      )}

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
    </div>
  );
}
