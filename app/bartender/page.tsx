"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../lib/supabase/client";

type Table = { id: string; name: string; status: string };
type Drink = { eventProductId: string; name: string; salePriceMinor: number; stock: number };
type Receipt = {
  barSaleId: string;
  totalMinor: number;
  productName: string;
  quantity: number;
  tableName: string;
  bartenderName: string;
  paymentMethod: string;
  createdAt: string;
};

function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

export default function BartenderPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [selling, setSelling] = useState(false);
  const [error, setError] = useState("");

  const [eventName, setEventName] = useState("");
  const [barName, setBarName] = useState("");
  const [tables, setTables] = useState<Table[]>([]);
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [barId, setBarId] = useState("");

  const [tableId, setTableId] = useState("");
  const [eventProductId, setEventProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<"efectivo" | "transferencia" | "">("");

  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.replace("/login");
        return;
      }

      try {
        const response = await fetch("/api/stock/bartender-context", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "No pudimos cargar la barra.");

        setEventName(result.event?.name ?? "Evento");
        setBarName(result.bar?.name ?? "Barra");
        setBarId(result.bar?.id ?? "");
        setTables(result.tables ?? []);
        setDrinks(result.drinks ?? []);
        if (result.drinks?.length > 0) setEventProductId(result.drinks[0].eventProductId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No pudimos cargar la barra.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [supabase]);

  const selectedDrink = drinks.find((d) => d.eventProductId === eventProductId) ?? null;
  const total = selectedDrink ? selectedDrink.salePriceMinor * quantity : 0;

  async function confirmSale() {
    if (!tableId || !eventProductId || !paymentMethod) return;
    setSelling(true);
    setError("");

    try {
      const response = await fetch("/api/stock/bartender-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barId, tableId: tableId === "NONE" ? null : tableId, eventProductId, quantity, paymentMethod }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo registrar la venta.");

      setReceipt(result.receipt as Receipt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la venta.");
    } finally {
      setSelling(false);
    }
  }

  function newSale() {
    setReceipt(null);
    setQuantity(1);
    setPaymentMethod("");
    setError("");
    // Recarga stock/mesas por si cambiaron.
    window.location.reload();
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.replace("/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-sm text-white/35">Preparando la barra...</p>
      </main>
    );
  }

  if (receipt) {
    return (
      <main className="relative min-h-screen bg-black px-5 py-8 text-white print:bg-white print:text-black">
        <div className="mx-auto max-w-sm">
          <div className="text-center print:hidden">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-3xl text-emerald-300">✓</div>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Venta registrada</p>
          </div>

          <div id="recibo" className="mt-6 rounded-2xl border border-white/15 bg-white/[0.03] p-6 font-mono text-sm print:border-black print:bg-white print:text-black">
            <p className="text-center text-base font-bold">Capital Pass — Barra</p>
            <p className="mt-1 text-center text-xs opacity-60">{eventName} · {barName}</p>
            <div className="mt-4 border-t border-dashed border-white/20 pt-4 print:border-black">
              <Row label="Mesa" value={receipt.tableName} />
              <Row label="Bebida" value={receipt.productName} />
              <Row label="Cantidad" value={String(receipt.quantity)} />
              <Row label="Bartender" value={receipt.bartenderName} />
              <Row label="Pago" value={receipt.paymentMethod === "efectivo" ? "Efectivo" : "Transferencia"} />
              <Row label="Hora" value={new Date(receipt.createdAt).toLocaleTimeString("es-AR")} />
            </div>
            <div className="mt-4 border-t border-dashed border-white/20 pt-4 print:border-black">
              <div className="flex items-center justify-between text-lg font-bold">
                <span>TOTAL</span>
                <span>{money(receipt.totalMinor)}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="h-14 w-full rounded-2xl border border-white/20 bg-white/[0.05] text-sm font-bold"
            >
              🖨️ Imprimir recibo
            </button>
            <button
              type="button"
              onClick={newSale}
              className="h-14 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-sm font-bold text-black"
            >
              + Nueva venta
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-black text-white">
      <div className="mx-auto max-w-sm px-5 py-7">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/40">Capital Pass · Barra</p>
            <h1 className="mt-1 text-xl font-bold">{barName || "Sin barra"}</h1>
            <p className="text-xs text-white/30">{eventName}</p>
          </div>
          <button type="button" onClick={logout} className="rounded-xl border border-white/15 px-3 py-2 text-xs text-white/50">
            Salir
          </button>
        </header>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
        )}

        {!barId ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">
            Todavía no tenés una barra asignada. Pedile al organizador que te cree como bartender.
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <section>
              <p className="mb-2 text-xs uppercase tracking-[0.15em] text-white/40">Mesa (opcional)</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTableId("NONE")}
                  className={`h-14 rounded-xl border text-sm font-bold ${
                    tableId === "NONE" ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.03] text-white/60"
                  }`}
                >
                  Sin mesa
                </button>
                {tables.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => setTableId(table.id)}
                    className={`h-14 rounded-xl border text-sm font-bold ${
                      tableId === table.id ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.03] text-white/60"
                    }`}
                  >
                    {table.name}
                  </button>
                ))}
              </div>
              {tables.length === 0 && <p className="text-sm text-white/30">Todavía no hay mesas cargadas. Podés vender igual eligiendo &quot;Sin mesa&quot;.</p>}
            </section>

            <section>
              <p className="mb-2 text-xs uppercase tracking-[0.15em] text-white/40">Bebida</p>
              <div className="space-y-2">
                {drinks.map((drink) => (
                  <button
                    key={drink.eventProductId}
                    type="button"
                    onClick={() => setEventProductId(drink.eventProductId)}
                    className={`flex h-14 w-full items-center justify-between rounded-xl border px-4 text-sm ${
                      eventProductId === drink.eventProductId ? "border-emerald-400/60 bg-emerald-500/10" : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <span className="font-bold">{drink.name}</span>
                    <span className="text-white/50">{money(drink.salePriceMinor)} · stock {drink.stock}</span>
                  </button>
                ))}
              </div>
              {drinks.length === 0 && <p className="text-sm text-white/30">Sin stock cargado en esta barra.</p>}
            </section>

            <section>
              <p className="mb-2 text-xs uppercase tracking-[0.15em] text-white/40">Cantidad</p>
              <div className="flex h-14 items-center rounded-xl border border-white/10 bg-white/[0.03]">
                <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="h-full w-14 text-xl">−</button>
                <div className="flex-1 text-center text-lg font-bold">{quantity}</div>
                <button type="button" onClick={() => setQuantity((q) => Math.min(20, q + 1))} className="h-full w-14 text-xl">+</button>
              </div>
            </section>

            <section>
              <p className="mb-2 text-xs uppercase tracking-[0.15em] text-white/40">Pago</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("efectivo")}
                  className={`h-14 rounded-xl border text-sm font-bold ${paymentMethod === "efectivo" ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.03]"}`}
                >
                  💵 Efectivo
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("transferencia")}
                  className={`h-14 rounded-xl border text-sm font-bold ${paymentMethod === "transferencia" ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.03]"}`}
                >
                  🏦 Transferencia
                </button>
              </div>
            </section>

            <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-5">
              <div className="flex items-center justify-between text-2xl font-black">
                <span className="text-sm font-normal text-white/40">Total</span>
                <span>{money(total)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={selling || !tableId || !eventProductId || !paymentMethod || quantity < 1}
              onClick={confirmSale}
              className="h-16 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-base font-black text-black disabled:cursor-not-allowed disabled:opacity-35"
            >
              {selling ? "Registrando..." : "Confirmar venta"}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #recibo, #recibo * { visibility: visible; }
          #recibo { position: fixed; top: 0; left: 0; width: 100%; }
        }
      `}</style>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="opacity-60">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
