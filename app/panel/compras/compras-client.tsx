"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Purchase = { id: string; supplier: string | null; description: string; total_minor: number; purchased_on: string; payment_method: string | null; notes: string | null };

const INPUT = "mt-2 h-12 w-full border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50";
const LABEL = "block text-[9px] font-black uppercase tracking-[0.18em] text-white/40";

function formatMoney(minor: number) {
  return `$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(minor)}`;
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function currentMonth() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

function shiftMonth(month: string, delta: number) {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}

export default function ComprasClient() {
  const [month, setMonth] = useState(currentMonth());
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [total, setTotal] = useState(0);
  const [suppliers, setSuppliers] = useState<{ name: string; totalMinor: number }[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/panel/compras?month=${month}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "No se pudo cargar.");
        if (!cancelled) {
          setPurchases(result.purchases);
          setTotal(result.totalMinor);
          setSuppliers(result.suppliers);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar.");
      }
    })();
    return () => { cancelled = true; };
  }, [month, reload]);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/panel/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, supplier, total: amount, purchasedOn: date, paymentMethod }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");
      setDescription("");
      setSupplier("");
      setAmount("");
      setPaymentMethod("");
      setPurchases(null);
      // Si la compra cae en otro mes, se salta a ese mes para verla.
      const savedMonth = String(result.purchase.purchased_on).slice(0, 7);
      if (savedMonth !== month) setMonth(savedMonth);
      else setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(purchase: Purchase) {
    if (!window.confirm(`¿Borrar "${purchase.description}"?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/panel/compras?id=${purchase.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo borrar.");
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    }
  }

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href="/panel" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Panel
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass</p>
          <h1 className="mt-3 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Compras.</h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">Registrá lo que comprás a tus proveedores (bebida, hielo, insumos) y mirá cuánto gastás por mes.</p>
        </header>

        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <form onSubmit={add} className="mt-8 border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Nueva compra</p>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <label className="mt-3 block">
              <span className={LABEL}>Qué compraste *</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="20 cajas de Fernet" className={INPUT} />
            </label>
            <label className="mt-3 block">
              <span className={LABEL}>Proveedor</span>
              <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={INPUT} />
            </label>
          </div>
          <div className="grid gap-x-4 sm:grid-cols-3">
            <label className="mt-3 block">
              <span className={LABEL}>Monto total ($) *</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className={INPUT} />
            </label>
            <label className="mt-3 block">
              <span className={LABEL}>Fecha (vacío = hoy)</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
            </label>
            <label className="mt-3 block">
              <span className={LABEL}>Forma de pago</span>
              <input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="Efectivo, transferencia…" className={INPUT} />
            </label>
          </div>
          <button type="submit" disabled={saving} className="mt-4 h-12 w-full bg-[#ff2a1a] text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d] disabled:opacity-40 sm:w-auto sm:px-8">
            {saving ? "Guardando…" : "+ Registrar compra"}
          </button>
        </form>

        <div className="mt-8 flex items-center justify-between gap-3">
          <button type="button" onClick={() => { setPurchases(null); setMonth(shiftMonth(month, -1)); }} className="h-10 border border-white/[0.10] px-4 text-[10px] font-black uppercase tracking-wide text-white/60">← Anterior</button>
          <p className="text-sm font-black capitalize">{monthLabel(month)}</p>
          <button type="button" disabled={month >= currentMonth()} onClick={() => { setPurchases(null); setMonth(shiftMonth(month, 1)); }} className="h-10 border border-white/[0.10] px-4 text-[10px] font-black uppercase tracking-wide text-white/60 disabled:opacity-30">Siguiente →</button>
        </div>

        <div className="mt-4 border border-white/[0.08] bg-white/[0.02] px-5 py-4">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Gastado en el mes</p>
          <p className="mt-1 text-3xl font-black text-amber-300">{formatMoney(total)}</p>
          {suppliers.length > 0 && (
            <p className="mt-2 text-xs text-white/45">
              {suppliers.map((s) => `${s.name}: ${formatMoney(s.totalMinor)}`).join(" · ")}
            </p>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {purchases === null ? (
            <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Cargando…</div>
          ) : purchases.length === 0 ? (
            <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">No hay compras en este mes.</div>
          ) : (
            purchases.map((purchase) => (
              <div key={purchase.id} className="flex items-center justify-between gap-3 border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{purchase.description}</p>
                  <p className="mt-0.5 text-[11px] text-white/40">
                    {formatDay(purchase.purchased_on)}
                    {purchase.supplier ? ` · ${purchase.supplier}` : ""}
                    {purchase.payment_method ? ` · ${purchase.payment_method}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-black text-amber-300">{formatMoney(purchase.total_minor)}</span>
                  <button type="button" onClick={() => remove(purchase)} className="h-8 border border-red-400/20 px-3 text-[9px] font-black uppercase tracking-wide text-red-300/70 hover:text-red-300">Borrar</button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
