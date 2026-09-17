"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Plan = { id: string; name: string; price_minor: number; currency: string } | null;

function money(value: number, currency: string) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export default function UpgradeScreen({ plan }: { plan: Plan }) {
  const [quote, setQuote] = useState<{ checkoutUrl: string; amountMinor: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const checking = useRef(false);

  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const returning = params?.get("upgrade") === "ok";

  const verify = async () => {
    if (checking.current) return;
    checking.current = true;
    setVerifying(true);
    try {
      const response = await fetch("/api/mercadopago/upgrade/verificar", { method: "POST" });
      const result = await response.json();
      if (response.ok && result.upgraded) {
        window.location.replace("/panel/stock");
        return;
      }
    } catch {
      // silencioso: reintenta con el proximo intervalo
    } finally {
      checking.current = false;
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (!returning) return;
    let attempts = 0;
    const run = () => { attempts++; void verify(); };
    const start = window.setTimeout(run, 500);
    const interval = window.setInterval(() => { if (attempts < 6) run(); else window.clearInterval(interval); }, 5000);
    return () => { window.clearTimeout(start); window.clearInterval(interval); };
  }, [returning]);

  async function requestUpgrade() {
    if (!plan || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/mercadopago/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "No pudimos calcular la actualización.");
      setQuote({ checkoutUrl: result.checkoutUrl, amountMinor: result.amountMinor });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos calcular la actualización.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#ff3b24]/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[#ff6530]/15 blur-[120px]" />
      <div className="relative mx-auto max-w-xl px-5 py-20 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Capital Pass · Stock</p>
        <h1 className="mt-4 text-3xl font-black">Tu prueba gratuita terminó</h1>
        <p className="mt-3 text-sm text-white/50">
          Ya usaste los 7 días de prueba del módulo de stock y barras. Para seguir usándolo —control de stock,
          barras, bartenders y mesas— actualizá tu suscripción a <span className="font-bold text-white">Gestión avanzada</span>.
        </p>

        {returning && (
          <p className="mt-5 text-sm text-white/60">
            {verifying ? "Confirmando tu pago con Mercado Pago..." : "Ya volviste de Mercado Pago. Si ya pagaste, esto se actualiza solo en unos segundos."}
          </p>
        )}

        {error && (
          <div className="mt-5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
        )}

        {!plan ? (
          <p className="mt-7 text-sm text-white/40">El plan Gestión avanzada no está disponible en este momento. Contactá a soporte.</p>
        ) : quote ? (
          <div className="mt-7 rounded-2xl border border-white/15 bg-white/[0.04] p-6">
            <p className="text-xs uppercase tracking-wide text-white/40">Vas a pagar ahora (proporcional a lo que te queda pago este mes)</p>
            <p className="mt-2 text-3xl font-black">{money(quote.amountMinor, "ARS")}</p>
            <p className="mt-2 text-xs text-white/35">Desde el próximo mes se cobra el precio completo de Gestión avanzada.</p>
            <a
              href={quote.checkoutUrl}
              className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] px-6 text-sm font-bold text-white shadow-[0_0_30px_rgba(255,59,36,.3)]"
            >
              Ir a pagar con Mercado Pago
            </a>
          </div>
        ) : (
          <button
            type="button"
            onClick={requestUpgrade}
            disabled={busy}
            className="mt-7 inline-flex h-12 items-center rounded-xl bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] px-6 text-sm font-bold text-white shadow-[0_0_30px_rgba(255,59,36,.3)] disabled:opacity-50"
          >
            {busy ? "Calculando..." : "Actualizar a Gestión avanzada"}
          </button>
        )}

        <div className="mt-6 flex items-center justify-center gap-5">
          <button type="button" onClick={verify} disabled={verifying} className="text-xs text-white/40 hover:text-white disabled:opacity-40">
            {verifying ? "Verificando..." : "Ya pagué, verificar"}
          </button>
          <Link href="/panel" className="text-xs text-white/40 hover:text-white">
            ← Volver al panel
          </Link>
        </div>
      </div>
    </main>
  );
}
