"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type TableOption = { id: string; name: string; capacity: number | null; priceMinor: number };

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

const INPUT =
  "mt-1 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#ff5a2a]/60";

// Reserva de mesas desde la pagina publica: se elige la mesa, se cargan los
// datos y se paga con Mercado Pago (la mesa queda reservada mientras se paga).
export default function EventTables({ slug, tables, feePercent }: { slug: string; tables: TableOption[]; feePercent: number }) {
  const [selected, setSelected] = useState<TableOption | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dni, setDni] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Al volver de Mercado Pago (?venta=...) se muestra el estado del pago, no las mesas.
  const returningFromPayment = Boolean(useSearchParams().get("venta"));

  // Si el comprador vuelve con "atras" desde Mercado Pago y el navegador
  // restaura esta pagina desde bfcache, el boton quedaria bloqueado.
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) setSubmitting(false);
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  if (tables.length === 0 || returningFromPayment) return null;

  const fee = selected ? Math.round(selected.priceMinor * (feePercent / 100)) : 0;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/e/${slug}/mesa/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: selected.id, firstName, lastName, dni, phone, email: email || undefined }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "No pudimos reservar la mesa.");
      window.location.assign(result.checkoutUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos reservar la mesa.");
      setSubmitting(false);
    }
  }

  return (
    <section id="mesas" className="mt-12 scroll-mt-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ff6f4d]">Mesas</p>
      <h2 className="mt-2 text-2xl font-semibold">Reservá tu mesa</h2>
      <p className="mt-2 text-sm text-white/35">Pagás con Mercado Pago y la mesa queda a tu nombre.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tables.map((table) => (
          <article key={table.id} className="rounded-[26px] border border-white/[0.09] bg-white/[0.025] p-6">
            <h3 className="text-lg font-bold">{table.name}</h3>
            <p className="mt-1 text-sm text-white/40">{table.capacity ? `Hasta ${table.capacity} personas` : "Mesa"}</p>
            <p className="mt-5 text-3xl font-black tracking-tight">{formatMoney(table.priceMinor)}</p>
            <button
              type="button"
              onClick={() => { setError(""); setSelected(table); }}
              className="mt-5 h-12 w-full rounded-xl border border-[#ff5a2a]/40 bg-[#ff3b24]/10 text-sm font-bold text-white transition hover:bg-[#ff3b24]/20"
            >
              Reservar
            </button>
          </article>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/70 md:items-center md:justify-center" onClick={() => !submitting && setSelected(null)}>
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-[460px] overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#0d0d0d] p-6 md:rounded-[28px]"
          >
            <h3 className="text-xl font-bold">Reservar {selected.name}</h3>
            <p className="mt-1 text-sm text-white/45">
              {formatMoney(selected.priceMinor)}
              {fee > 0 ? ` + ${formatMoney(fee)} de cargo por servicio = ${formatMoney(selected.priceMinor + fee)}` : ""}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-white/40">Nombre</span>
                <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={INPUT} autoComplete="given-name" />
              </label>
              <label className="block">
                <span className="text-xs text-white/40">Apellido</span>
                <input required value={lastName} onChange={(e) => setLastName(e.target.value)} className={INPUT} autoComplete="family-name" />
              </label>
            </div>
            <label className="mt-3 block">
              <span className="text-xs text-white/40">DNI</span>
              <input required inputMode="numeric" value={dni} onChange={(e) => setDni(e.target.value)} className={INPUT} />
            </label>
            <label className="mt-3 block">
              <span className="text-xs text-white/40">WhatsApp</span>
              <input required inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT} autoComplete="tel" />
            </label>
            <label className="mt-3 block">
              <span className="text-xs text-white/40">Email (para enterarte si algo cambia)</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} autoComplete="email" />
            </label>

            <p className="mt-4 text-[11px] leading-5 text-white/30">La mesa queda reservada 30 minutos mientras pagás. Si no se completa el pago, vuelve a estar disponible.</p>

            {error && <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

            <div className="mt-5 flex gap-2">
              <button type="button" disabled={submitting} onClick={() => setSelected(null)} className="h-12 flex-1 rounded-xl border border-white/15 text-sm font-semibold text-white/60">
                Volver
              </button>
              <button type="submit" disabled={submitting} className="h-12 flex-[2] rounded-xl bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] text-sm font-bold text-white disabled:opacity-50">
                {submitting ? "Abriendo Mercado Pago…" : "Pagar y reservar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
