"use client";

import { useState } from "react";

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  billing_interval: string;
  active: boolean;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

export default function PlanesClient({ plans }: { plans: Plan[] }) {
  const [items, setItems] = useState(plans);
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(plans.map((p) => [p.id, String(p.price_minor)]))
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  async function savePrice(planId: string) {
    const draft = drafts[planId];
    const priceMinor = Number(draft);
    if (!Number.isInteger(priceMinor) || priceMinor < 0) {
      setError("El precio tiene que ser un número entero mayor o igual a cero.");
      return;
    }

    setSavingId(planId);
    setError("");
    setSavedId(null);
    try {
      const response = await fetch("/api/admin/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, priceMinor }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar el precio.");
      setItems((prev) => prev.map((p) => (p.id === planId ? result.plan : p)));
      setSavedId(planId);
      setTimeout(() => setSavedId((current) => (current === planId ? null : current)), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el precio.");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(planId: string, active: boolean) {
    setSavingId(planId);
    setError("");
    try {
      const response = await fetch("/api/admin/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, active }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar el plan.");
      setItems((prev) => prev.map((p) => (p.id === planId ? result.plan : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el plan.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="mt-5 border border-white/[0.08] bg-[#090807]/92">
      <div className="border-b border-white/[0.07] px-5 py-5 md:px-6">
        <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#ff7958]">Billing</p>
        <h2 className="mt-2 text-xl font-black uppercase tracking-[-0.035em]">Planes y precios</h2>
        <p className="mt-2 text-xs text-white/35">
          El precio nuevo se aplica a partir del próximo cobro. No cambia lo que ya le cobraste a alguien este mes.
        </p>
      </div>

      {error && (
        <div className="mx-5 mt-5 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300 md:mx-6">{error}</div>
      )}

      <div className="divide-y divide-white/[0.06]">
        {items.map((plan) => (
          <div key={plan.id} className="grid gap-4 px-5 py-5 md:grid-cols-[1.3fr_1fr_.7fr] md:items-center md:px-6">
            <div>
              <p className="text-base font-black text-white/85">{plan.name}</p>
              <p className="mt-1 text-xs text-white/30">{plan.code}</p>
              {plan.description && <p className="mt-2 max-w-md text-xs leading-5 text-white/35">{plan.description}</p>}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">$</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={drafts[plan.id] ?? ""}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [plan.id]: e.target.value }))}
                className="h-11 w-32 border border-white/15 bg-white/[0.03] px-3 text-sm font-bold text-white outline-none focus:border-[#ff5a2a]/50"
              />
              <span className="text-xs text-white/30">/ {plan.billing_interval === "monthly" ? "mes" : plan.billing_interval}</span>
              <button
                type="button"
                disabled={savingId === plan.id || drafts[plan.id] === String(plan.price_minor)}
                onClick={() => savePrice(plan.id)}
                className="ml-2 h-11 shrink-0 rounded-lg bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] px-4 text-xs font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                {savingId === plan.id ? "Guardando..." : savedId === plan.id ? "Guardado ✓" : "Guardar"}
              </button>
            </div>

            <div className="flex items-center gap-3 md:justify-end">
              <p className="text-sm text-white/50">Actual: {formatMoney(plan.price_minor)}</p>
              <button
                type="button"
                disabled={savingId === plan.id}
                onClick={() => toggleActive(plan.id, !plan.active)}
                className={`h-9 rounded-full border px-3 text-[10px] font-black uppercase tracking-wide ${
                  plan.active ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" : "border-white/15 bg-white/[0.03] text-white/40"
                }`}
              >
                {plan.active ? "Activo" : "Oculto"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
