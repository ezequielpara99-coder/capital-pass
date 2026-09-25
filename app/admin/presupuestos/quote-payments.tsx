"use client";

import { FormEvent, useEffect, useState } from "react";
import { formatMoney } from "../../../lib/quotes/totals";

type Payment = { id: string; amount_minor: number; paid_at: string; method: string; notes: string | null };

const INPUT =
  "mt-2 h-11 w-full border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50";
const LABEL = "block text-[9px] font-black uppercase tracking-[0.18em] text-white/40";
const METHOD_LABEL: Record<string, string> = {
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  mercadopago: "MercadoPago",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(`${value}T12:00:00`));
}

function emptyDraft() {
  return { amountMinor: "", paidAt: new Date().toISOString().slice(0, 10), method: "transferencia", notes: "" };
}

// Cobros registrados contra este presupuesto -- solo aplica una vez que el
// presupuesto ya se guardó y quedó facturado (a_pagar/aceptado), que es
// justo la condición que valida el servidor al registrar un pago.
export default function QuotePayments({ quoteId, total }: { quoteId: string; total: number }) {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const response = await fetch(`/api/admin/presupuestos/${quoteId}/pagos`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudieron cargar los pagos.");
      setPayments(result.payments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los pagos.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  async function addPayment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/presupuestos/${quoteId}/pagos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo registrar el pago.");
      setDraft(emptyDraft());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el pago.");
    } finally {
      setSaving(false);
    }
  }

  async function removePayment(payment: Payment) {
    if (!window.confirm("¿Borrar este pago?")) return;
    setError("");
    try {
      const response = await fetch(`/api/admin/presupuestos/${quoteId}/pagos?paymentId=${payment.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo borrar.");
      setPayments((prev) => (prev ?? []).filter((row) => row.id !== payment.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    }
  }

  const cobrado = (payments ?? []).reduce((sum, p) => sum + p.amount_minor, 0);
  const pendiente = Math.max(0, total - cobrado);

  return (
    <section className="mt-10">
      <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Cobros</h2>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="border border-white/[0.08] bg-white/[0.02] p-3">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/35">Facturado</p>
          <p className="mt-1 text-sm font-black">{formatMoney(total)}</p>
        </div>
        <div className="border border-emerald-400/25 bg-emerald-400/10 p-3">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-300/70">Cobrado</p>
          <p className="mt-1 text-sm font-black text-emerald-300">{formatMoney(cobrado)}</p>
        </div>
        <div className="border border-amber-400/25 bg-amber-400/10 p-3">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-300/70">Pendiente</p>
          <p className="mt-1 text-sm font-black text-amber-300">{formatMoney(pendiente)}</p>
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}

      {payments && payments.length > 0 && (
        <div className="mt-4 space-y-2">
          {payments.map((payment) => (
            <div key={payment.id} className="flex items-center gap-3 border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{formatMoney(payment.amount_minor)}</p>
                <p className="truncate text-[11px] text-white/35">
                  {formatDate(payment.paid_at)} · {METHOD_LABEL[payment.method] ?? payment.method}
                  {payment.notes ? ` · ${payment.notes}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => removePayment(payment)} className="h-8 shrink-0 border border-red-400/20 px-3 text-[10px] font-black uppercase tracking-wide text-red-300/70 hover:text-red-300">
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={addPayment} className="mt-4 border border-white/[0.08] bg-white/[0.02] p-4">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Registrar pago</p>
        <div className="mt-2 grid gap-x-3 sm:grid-cols-3">
          <label className="block">
            <span className={LABEL}>Monto *</span>
            <input value={draft.amountMinor} onChange={(e) => setDraft((d) => ({ ...d, amountMinor: e.target.value }))} inputMode="numeric" className={INPUT} placeholder="0" />
          </label>
          <label className="block">
            <span className={LABEL}>Fecha</span>
            <input type="date" value={draft.paidAt} onChange={(e) => setDraft((d) => ({ ...d, paidAt: e.target.value }))} className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>Método</span>
            <select value={draft.method} onChange={(e) => setDraft((d) => ({ ...d, method: e.target.value }))} className={INPUT}>
              {Object.entries(METHOD_LABEL).map(([value, label]) => (
                <option key={value} value={value} className="bg-[#0a0908]">{label}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-2 block">
          <span className={LABEL}>Notas</span>
          <input value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} className={INPUT} placeholder="Seña, primer pago, saldo…" />
        </label>
        <button type="submit" disabled={saving} className="mt-3 h-11 w-full border border-emerald-400/30 bg-emerald-400/10 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-40 sm:w-auto sm:px-6">
          {saving ? "Guardando…" : "+ Registrar cobro"}
        </button>
      </form>
    </section>
  );
}
