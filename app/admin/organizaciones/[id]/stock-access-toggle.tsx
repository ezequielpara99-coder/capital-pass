"use client";

import { useState } from "react";

export default function StockAccessToggle({
  organizationId,
  initialBlocked,
}: {
  organizationId: string;
  initialBlocked: boolean;
}) {
  const [blocked, setBlocked] = useState(initialBlocked);
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
        body: JSON.stringify({ organizationId, stockBlocked: next }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar.");
      setBlocked(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-white/[0.07] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#ff7958]">Acceso a Stock</p>
          <p className="mt-2 max-w-[520px] text-sm leading-6 text-white/40">
            {blocked
              ? "El módulo de Stock (barras, bartenders, mesas) está bloqueado para esta cuenta. El resto sigue funcionando normal."
              : "Bloqueá el módulo de Stock puntualmente, sin tocar la cortesía ni el resto de la cuenta."}
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void save(!blocked)}
          className={`h-11 px-5 text-[10px] font-black uppercase tracking-[0.16em] transition disabled:opacity-50 ${
            blocked
              ? "border border-red-400/30 bg-red-500/10 text-red-300 hover:bg-red-500/15"
              : "border border-white/[0.14] text-white/60 hover:text-white"
          }`}
        >
          {busy ? "Guardando..." : blocked ? "🔒 Bloqueado · desbloquear" : "Bloquear stock"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
    </div>
  );
}
