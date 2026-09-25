"use client";

import { useState } from "react";

export default function PremiumMembershipToggle({
  organizationId,
  initialEnabled,
}: {
  organizationId: string;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(next: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/cuentas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, premiumMembershipsEnabled: next }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar.");
      setEnabled(next);
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
          <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#ff7958]">Membresía premium</p>
          <p className="mt-2 max-w-[520px] text-sm leading-6 text-white/40">
            {enabled
              ? "Este organizador puede llevar su padrón de socios premium desde /panel/membresia."
              : "Addon pago aparte de la suscripción. Habilitalo una vez que el organizador te pague por fuera."}
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void save(!enabled)}
          className={`h-11 px-5 text-[10px] font-black uppercase tracking-[0.16em] transition disabled:opacity-50 ${
            enabled
              ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
              : "bg-[#ff2a1a] text-white hover:bg-[#ff4a2d]"
          }`}
        >
          {busy ? "Guardando..." : enabled ? "✓ Habilitada · quitar" : "Habilitar"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
    </div>
  );
}
