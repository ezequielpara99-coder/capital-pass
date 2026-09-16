"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type EventOption = { id: string; name: string };
type Product = { id: string; name: string; category: string; brand: string | null; image_path: string | null; servings_per_bottle: number | null; organization_id: string | null };
type EventProduct = {
  id: string;
  product_id: string;
  cost_price_minor: number;
  sale_price_minor: number;
  profit_margin_percent: number;
  total_stock: number;
  low_stock_threshold: number;
  product: { name: string; category: string; brand: string | null } | null;
};
type Bar = { id: string; name: string; created_at: string };
type BarStockRow = { bar_id: string; event_product_id: string; quantity: number };
type TableRow = { id: string; name: string; capacity: number | null; price_minor: number | null; status: string };
type Movement = { id: string; event_product_id: string; bar_id: string | null; type: string; quantity: number; reason: string | null; created_at: string };
type Bartender = { memberId: string; firstName: string; lastName: string; active: boolean; barId: string | null };

type Overview = {
  bars: Bar[];
  eventProducts: EventProduct[];
  barStock: BarStockRow[];
  tables: TableRow[];
  movements: Movement[];
  bartenders: Bartender[];
};

const TABS = ["Stock general", "Barras", "Bartenders", "Mesas", "Movimientos", "Alertas"] as const;
type Tab = (typeof TABS)[number];

function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

export default function StockPanelClient({
  organizationId,
  events,
  currentEventId,
}: {
  organizationId: string;
  events: EventOption[];
  currentEventId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Stock general");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const [overviewRes, catalogRes] = await Promise.all([
        fetch(`/api/stock/overview?eventId=${currentEventId}`, { cache: "no-store" }),
        fetch(`/api/stock/products?organizationId=${organizationId}`, { cache: "no-store" }),
      ]);
      const overviewData = await overviewRes.json();
      const catalogData = await catalogRes.json();
      if (!overviewRes.ok) throw new Error(overviewData.error ?? "No se pudo cargar el stock.");
      if (!catalogRes.ok) throw new Error(catalogData.error ?? "No se pudo cargar el catálogo.");
      setOverview(overviewData);
      setCatalog(catalogData.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el stock.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEventId]);

  const eventProductById = useMemo(
    () => new Map((overview?.eventProducts ?? []).map((ep) => [ep.id, ep])),
    [overview]
  );
  const barById = useMemo(() => new Map((overview?.bars ?? []).map((b) => [b.id, b])), [overview]);

  function notify(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(""), 3000);
  }

  return (
    <main className="relative min-h-screen bg-black text-white">
      <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <Link href="/panel" className="text-xs text-white/40 hover:text-white">← Panel</Link>
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-400">Capital Pass</p>
            <h1 className="mt-1 text-3xl font-black uppercase tracking-[-0.03em] md:text-4xl">Stock &amp; Barra</h1>
          </div>

          {events.length > 1 && (
            <select
              defaultValue={currentEventId}
              onChange={(e) => router.push(`/panel/stock?eventId=${e.target.value}`)}
              className="h-11 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id} className="bg-black">{ev.name}</option>
              ))}
            </select>
          )}
        </header>

        <nav className="mt-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`h-10 rounded-lg px-4 text-xs font-bold uppercase tracking-wide transition ${
                tab === t ? "bg-emerald-500 text-black" : "border border-white/10 bg-white/[0.03] text-white/50 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        {message && <div className="mt-5 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">{message}</div>}
        {error && <div className="mt-5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {loading || !overview ? (
          <p className="mt-10 text-sm text-white/40">Cargando...</p>
        ) : (
          <div className="mt-7">
            {tab === "Stock general" && (
              <StockGeneralTab
                eventId={currentEventId}
                catalog={catalog}
                eventProducts={overview.eventProducts}
                onSaved={() => { notify("Guardado."); reload(); }}
                onError={setError}
              />
            )}
            {tab === "Barras" && (
              <BarrasTab
                eventId={currentEventId}
                bars={overview.bars}
                eventProducts={overview.eventProducts}
                barStock={overview.barStock}
                onSaved={() => { notify("Listo."); reload(); }}
                onError={setError}
              />
            )}
            {tab === "Bartenders" && (
              <BartendersTab
                eventId={currentEventId}
                bars={overview.bars}
                bartenders={overview.bartenders}
                onSaved={() => { notify("Listo."); reload(); }}
                onError={setError}
              />
            )}
            {tab === "Mesas" && (
              <MesasTab
                eventId={currentEventId}
                tables={overview.tables}
                onSaved={() => { notify("Listo."); reload(); }}
                onError={setError}
              />
            )}
            {tab === "Movimientos" && (
              <MovimientosTab movements={overview.movements} eventProductById={eventProductById} barById={barById} />
            )}
            {tab === "Alertas" && (
              <AlertasTab bars={overview.bars} eventProducts={overview.eventProducts} barStock={overview.barStock} />
            )}
          </div>
        )}
      </div>
    </main>
  );
}

// =====================================================================
// STOCK GENERAL
// =====================================================================

function StockGeneralTab({
  eventId, catalog, eventProducts, onSaved, onError,
}: {
  eventId: string; catalog: Product[]; eventProducts: EventProduct[];
  onSaved: () => void; onError: (msg: string) => void;
}) {
  const [productId, setProductId] = useState(catalog[0]?.id ?? "");
  const [costPrice, setCostPrice] = useState("0");
  const [servings, setServings] = useState("15");
  const [margin, setMargin] = useState("50");
  const [manualSalePrice, setManualSalePrice] = useState("0");
  const [totalStock, setTotalStock] = useState("0");
  const [threshold, setThreshold] = useState("5");
  const [saving, setSaving] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);

  const costPerServing = servings && Number(servings) > 0 ? Number(costPrice) / Number(servings) : 0;
  const suggestedPrice = margin ? Math.round(costPerServing / (1 - Number(margin) / 100)) : Math.round(costPerServing);
  const salePrice = manualOverride ? manualSalePrice : String(suggestedPrice || 0);

  const profit = Number(salePrice) - costPerServing;
  const profitPercent = Number(salePrice) > 0 ? (profit / Number(salePrice)) * 100 : 0;

  async function save() {
    if (!productId) return;
    setSaving(true);
    try {
      const response = await fetch("/api/stock/event-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId, productId,
          costPriceMinor: Number(costPrice), salePriceMinor: Number(salePrice),
          profitMarginPercent: Number(margin), totalStock: Number(totalStock), lowStockThreshold: Number(threshold),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Catálogo cargado en este evento</h2>
          <Link
            href={`/panel/stock/carta?eventId=${eventId}`}
            className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300"
          >
            📄 Carta de tragos (PDF)
          </Link>
        </div>
        <div className="mt-4 divide-y divide-white/5">
          {eventProducts.length === 0 && <p className="py-4 text-sm text-white/35">Todavía no cargaste productos.</p>}
          {eventProducts.map((ep) => (
            <div key={ep.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-bold">{ep.product?.name ?? "Producto"}</p>
                <p className="text-xs text-white/40">Costo {money(ep.cost_price_minor)} · Venta {money(ep.sale_price_minor)} · Stock total {ep.total_stock}</p>
              </div>
              <span className="text-xs text-white/30">Alerta en {ep.low_stock_threshold}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.03] p-6">
        <h2 className="text-lg font-bold">Agregar / actualizar producto</h2>

        <label className="mt-4 block text-xs text-white/40">
          Producto del catálogo
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm">
            {catalog.map((p) => (
              <option key={p.id} value={p.id} className="bg-black">{p.name}{p.organization_id ? " (propio)" : ""}</option>
            ))}
          </select>
        </label>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Costo de la botella" value={costPrice} onChange={setCostPrice} />
          <Field label="Tragos por botella" value={servings} onChange={setServings} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="% de ganancia deseado" value={margin} onChange={setMargin} />
          <Field
            label="Precio del trago (editable)"
            value={salePrice}
            onChange={(v) => { setManualOverride(true); setManualSalePrice(v); }}
          />
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-4 text-sm">
          <p className="text-white/40">Costo por trago: <span className="text-white">{money(Math.round(costPerServing))}</span></p>
          <p className="mt-1 text-white/40">Precio sugerido ({margin}% ganancia): <span className="text-white">{money(suggestedPrice)}</span></p>
          <p className="mt-1 text-white/40">Ganancia real con el precio cargado: <span className={profit >= 0 ? "text-emerald-400" : "text-red-400"}>{money(Math.round(profit))} ({profitPercent.toFixed(0)}%)</span></p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Stock total comprado" value={totalStock} onChange={setTotalStock} />
          <Field label="Alertar con stock ≤" value={threshold} onChange={setThreshold} />
        </div>

        <button type="button" disabled={saving} onClick={save} className="mt-5 h-12 w-full rounded-xl bg-emerald-500 text-sm font-black text-black disabled:opacity-40">
          {saving ? "Guardando..." : "Guardar producto"}
        </button>
      </section>
    </div>
  );
}

// =====================================================================
// BARRAS
// =====================================================================

function BarrasTab({
  eventId, bars, eventProducts, barStock, onSaved, onError,
}: {
  eventId: string; bars: Bar[]; eventProducts: EventProduct[]; barStock: BarStockRow[];
  onSaved: () => void; onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [selectedBar, setSelectedBar] = useState(bars[0]?.id ?? "");
  const [assignProduct, setAssignProduct] = useState(eventProducts[0]?.id ?? "");
  const [assignQty, setAssignQty] = useState("0");
  const [saving, setSaving] = useState(false);

  const [adjustBar, setAdjustBar] = useState(bars[0]?.id ?? "");
  const [adjustProduct, setAdjustProduct] = useState(eventProducts[0]?.id ?? "");
  const [adjustType, setAdjustType] = useState<"ajuste" | "perdida">("perdida");
  const [adjustQty, setAdjustQty] = useState("1");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  async function createBar() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const response = await fetch("/api/stock/bars", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, name: name.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setName("");
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo crear la barra.");
    } finally {
      setSaving(false);
    }
  }

  async function assignStock() {
    if (!selectedBar || !assignProduct || Number(assignQty) <= 0) return;
    setSaving(true);
    try {
      const response = await fetch("/api/stock/assign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barId: selectedBar, eventProductId: assignProduct, quantity: Number(assignQty) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAssignQty("0");
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo asignar el stock.");
    } finally {
      setSaving(false);
    }
  }

  async function submitAdjustment() {
    if (!adjustBar || !adjustProduct || Number(adjustQty) === 0 || !adjustReason.trim()) return;
    setAdjusting(true);
    try {
      const delta = adjustType === "perdida" ? -Math.abs(Number(adjustQty)) : Number(adjustQty);
      const response = await fetch("/api/stock/adjust", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barId: adjustBar, eventProductId: adjustProduct, quantityDelta: delta, type: adjustType, reason: adjustReason.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAdjustQty("1");
      setAdjustReason("");
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo registrar el ajuste.");
    } finally {
      setAdjusting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[.7fr_1.3fr]">
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-lg font-bold">Crear barra</h2>
        <input
          value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Barra 1"
          className="mt-4 h-12 w-full rounded-lg border border-white/15 bg-black px-3 text-sm"
        />
        <button type="button" disabled={saving} onClick={createBar} className="mt-3 h-12 w-full rounded-xl bg-emerald-500 text-sm font-black text-black disabled:opacity-40">
          + Crear barra
        </button>

        <div className="mt-6 space-y-2">
          {bars.map((bar) => (
            <div key={bar.id} className="rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold">{bar.name}</div>
          ))}
          {bars.length === 0 && <p className="text-sm text-white/35">Sin barras todavía.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.03] p-6">
        <h2 className="text-lg font-bold">Asignar stock del pool general a una barra</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block text-xs text-white/40">
            Barra
            <select value={selectedBar} onChange={(e) => setSelectedBar(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm">
              {bars.map((b) => <option key={b.id} value={b.id} className="bg-black">{b.name}</option>)}
            </select>
          </label>
          <label className="block text-xs text-white/40">
            Producto
            <select value={assignProduct} onChange={(e) => setAssignProduct(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm">
              {eventProducts.map((ep) => <option key={ep.id} value={ep.id} className="bg-black">{ep.product?.name ?? "Producto"}</option>)}
            </select>
          </label>
          <Field label="Cantidad" value={assignQty} onChange={setAssignQty} />
        </div>
        <button type="button" disabled={saving} onClick={assignStock} className="mt-4 h-12 w-full rounded-xl bg-emerald-500 text-sm font-black text-black disabled:opacity-40 sm:w-auto sm:px-8">
          Asignar
        </button>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-white/30">
                <th className="pb-2">Barra</th><th className="pb-2">Producto</th><th className="pb-2">Stock actual</th>
              </tr>
            </thead>
            <tbody>
              {barStock.map((row) => {
                const bar = bars.find((b) => b.id === row.bar_id);
                const ep = eventProducts.find((e) => e.id === row.event_product_id);
                return (
                  <tr key={`${row.bar_id}-${row.event_product_id}`} className="border-t border-white/5">
                    <td className="py-2">{bar?.name ?? "—"}</td>
                    <td className="py-2">{ep?.product?.name ?? "—"}</td>
                    <td className="py-2 font-bold">{row.quantity}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.03] p-6 lg:col-span-2">
        <h2 className="text-lg font-bold">Ajuste manual / pérdida</h2>
        <p className="mt-1 text-xs text-white/40">Para descontar o corregir stock de una barra sin que sea una venta (rotura, robo, recuento).</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          <label className="block text-xs text-white/40">
            Barra
            <select value={adjustBar} onChange={(e) => setAdjustBar(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm">
              {bars.map((b) => <option key={b.id} value={b.id} className="bg-black">{b.name}</option>)}
            </select>
          </label>
          <label className="block text-xs text-white/40">
            Producto
            <select value={adjustProduct} onChange={(e) => setAdjustProduct(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm">
              {eventProducts.map((ep) => <option key={ep.id} value={ep.id} className="bg-black">{ep.product?.name ?? "Producto"}</option>)}
            </select>
          </label>
          <label className="block text-xs text-white/40">
            Tipo
            <select value={adjustType} onChange={(e) => setAdjustType(e.target.value as "ajuste" | "perdida")} className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm">
              <option value="perdida" className="bg-black">Pérdida (resta)</option>
              <option value="ajuste" className="bg-black">Ajuste (suma o resta)</option>
            </select>
          </label>
          <Field label="Cantidad" value={adjustQty} onChange={setAdjustQty} />
          <Field label="Motivo" value={adjustReason} onChange={setAdjustReason} placeholder="Ej: rotura, recuento" />
        </div>
        <button type="button" disabled={adjusting} onClick={submitAdjustment} className="mt-4 h-12 rounded-xl border border-amber-400/30 bg-amber-400/10 px-8 text-sm font-black text-amber-300 disabled:opacity-40">
          Registrar
        </button>
      </section>
    </div>
  );
}

// =====================================================================
// BARTENDERS
// =====================================================================

function BartendersTab({
  eventId, bars, bartenders, onSaved, onError,
}: {
  eventId: string; bars: Bar[]; bartenders: Bartender[];
  onSaved: () => void; onError: (msg: string) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [barId, setBarId] = useState(bars[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    try {
      const response = await fetch("/api/bartenders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, barId, firstName, lastName, email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setFirstName(""); setLastName(""); setEmail(""); setPassword("");
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo crear el bartender.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(memberId: string, active: boolean) {
    try {
      const response = await fetch("/api/bartenders", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, memberId, active }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo actualizar.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
      <section className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.03] p-6">
        <h2 className="text-lg font-bold">Nuevo bartender</h2>
        {bars.length === 0 && <p className="mt-3 text-sm text-amber-300">Creá una barra primero.</p>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Nombre" value={firstName} onChange={setFirstName} />
          <Field label="Apellido" value={lastName} onChange={setLastName} />
        </div>
        <div className="mt-3"><Field label="Email" value={email} onChange={setEmail} /></div>
        <div className="mt-3"><Field label="Contraseña inicial" value={password} onChange={setPassword} type="password" /></div>
        <label className="mt-3 block text-xs text-white/40">
          Barra asignada
          <select value={barId} onChange={(e) => setBarId(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm">
            {bars.map((b) => <option key={b.id} value={b.id} className="bg-black">{b.name}</option>)}
          </select>
        </label>
        <button type="button" disabled={saving || bars.length === 0} onClick={create} className="mt-5 h-12 w-full rounded-xl bg-emerald-500 text-sm font-black text-black disabled:opacity-40">
          Crear bartender
        </button>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-lg font-bold">Equipo</h2>
        <div className="mt-4 divide-y divide-white/5">
          {bartenders.map((bt) => (
            <div key={bt.memberId} className="flex items-center justify-between py-3">
              <div>
                <p className="font-bold">{bt.firstName} {bt.lastName}</p>
                <p className="text-xs text-white/40">{bars.find((b) => b.id === bt.barId)?.name ?? "Sin barra"}</p>
              </div>
              <button
                type="button" onClick={() => toggle(bt.memberId, !bt.active)}
                className={`rounded-lg border px-3 py-2 text-xs font-bold ${bt.active ? "border-emerald-400/30 text-emerald-300" : "border-white/15 text-white/40"}`}
              >
                {bt.active ? "Activo" : "Pausado"}
              </button>
            </div>
          ))}
          {bartenders.length === 0 && <p className="py-4 text-sm text-white/35">Sin bartenders todavía.</p>}
        </div>
      </section>
    </div>
  );
}

// =====================================================================
// MESAS
// =====================================================================

function MesasTab({
  eventId, tables, onSaved, onError,
}: {
  eventId: string; tables: TableRow[]; onSaved: () => void; onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("6");
  const [price, setPrice] = useState("0");
  const [saving, setSaving] = useState(false);

  const [sellingTable, setSellingTable] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dni, setDni] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"efectivo" | "transferencia" | "">("");

  async function createTable() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const response = await fetch("/api/stock/tables", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, name: name.trim(), capacity: Number(capacity) || null, priceMinor: Number(price) || null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setName("");
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo crear la mesa.");
    } finally {
      setSaving(false);
    }
  }

  async function sellTable() {
    if (!sellingTable || !firstName.trim() || !lastName.trim() || !phone.trim() || !paymentMethod) return;
    setSaving(true);
    try {
      const response = await fetch("/api/stock/tables/vender", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, tableId: sellingTable, firstName, lastName, dni, phone, paymentMethod }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSellingTable(null); setFirstName(""); setLastName(""); setDni(""); setPhone(""); setPaymentMethod("");
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo vender la mesa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[.7fr_1.3fr]">
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-lg font-bold">Crear mesa</h2>
        <div className="mt-4 space-y-3">
          <Field label="Nombre" value={name} onChange={setName} placeholder="Ej: Mesa 1 / VIP 3" />
          <Field label="Capacidad" value={capacity} onChange={setCapacity} />
          <Field label="Precio de reserva (0 = sin costo)" value={price} onChange={setPrice} />
        </div>
        <button type="button" disabled={saving} onClick={createTable} className="mt-4 h-12 w-full rounded-xl bg-emerald-500 text-sm font-black text-black disabled:opacity-40">
          + Crear mesa
        </button>
      </section>

      <section className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.03] p-6">
        <h2 className="text-lg font-bold">Mesas</h2>
        <div className="mt-4 space-y-3">
          {tables.map((table) => (
            <div key={table.id} className="rounded-xl border border-white/10 bg-black/40 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">{table.name}</p>
                  <p className="text-xs text-white/40">Capacidad {table.capacity ?? "—"} · {table.price_minor ? money(table.price_minor) : "Sin costo"} · {table.status}</p>
                </div>
                {table.status === "available" && (
                  <button type="button" onClick={() => setSellingTable(sellingTable === table.id ? null : table.id)} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black text-black">
                    Vender
                  </button>
                )}
              </div>

              {sellingTable === table.id && (
                <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Nombre" value={firstName} onChange={setFirstName} />
                    <Field label="Apellido" value={lastName} onChange={setLastName} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="DNI" value={dni} onChange={setDni} />
                    <Field label="WhatsApp" value={phone} onChange={setPhone} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => setPaymentMethod("efectivo")} className={`h-11 rounded-lg border text-sm font-bold ${paymentMethod === "efectivo" ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-300" : "border-white/10"}`}>💵 Efectivo</button>
                    <button type="button" onClick={() => setPaymentMethod("transferencia")} className={`h-11 rounded-lg border text-sm font-bold ${paymentMethod === "transferencia" ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-300" : "border-white/10"}`}>🏦 Transferencia</button>
                  </div>
                  <button type="button" disabled={saving} onClick={sellTable} className="h-11 w-full rounded-lg bg-emerald-500 text-sm font-black text-black disabled:opacity-40">
                    Confirmar venta
                  </button>
                </div>
              )}
            </div>
          ))}
          {tables.length === 0 && <p className="text-sm text-white/35">Sin mesas todavía.</p>}
        </div>
      </section>
    </div>
  );
}

// =====================================================================
// MOVIMIENTOS
// =====================================================================

function MovimientosTab({
  movements, eventProductById, barById,
}: {
  movements: Movement[];
  eventProductById: Map<string, EventProduct>;
  barById: Map<string, Bar>;
}) {
  const typeLabel: Record<string, string> = {
    ingreso: "Ingreso", asignacion_barra: "Asignación a barra", venta: "Venta", ajuste: "Ajuste", perdida: "Pérdida",
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <h2 className="text-lg font-bold">Movimientos de stock</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-white/30">
              <th className="pb-2">Fecha</th><th className="pb-2">Tipo</th><th className="pb-2">Producto</th><th className="pb-2">Barra</th><th className="pb-2">Cantidad</th><th className="pb-2">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id} className="border-t border-white/5">
                <td className="py-2 text-white/50">{new Date(m.created_at).toLocaleString("es-AR")}</td>
                <td className="py-2">{typeLabel[m.type] ?? m.type}</td>
                <td className="py-2">{eventProductById.get(m.event_product_id)?.product?.name ?? "—"}</td>
                <td className="py-2">{m.bar_id ? barById.get(m.bar_id)?.name ?? "—" : "General"}</td>
                <td className="py-2 font-bold">{m.quantity}</td>
                <td className="py-2 text-white/40">{m.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {movements.length === 0 && <p className="py-4 text-sm text-white/35">Sin movimientos todavía.</p>}
      </div>
    </section>
  );
}

// =====================================================================
// ALERTAS
// =====================================================================

function AlertasTab({
  bars, eventProducts, barStock,
}: {
  bars: Bar[]; eventProducts: EventProduct[]; barStock: BarStockRow[];
}) {
  const alerts = barStock
    .map((row) => {
      const ep = eventProducts.find((e) => e.id === row.event_product_id);
      const bar = bars.find((b) => b.id === row.bar_id);
      if (!ep) return null;
      return { bar: bar?.name ?? "—", product: ep.product?.name ?? "—", quantity: row.quantity, threshold: ep.low_stock_threshold };
    })
    .filter((a): a is { bar: string; product: string; quantity: number; threshold: number } => a !== null && a.quantity <= a.threshold);

  return (
    <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-6">
      <h2 className="text-lg font-bold">Alertas de stock bajo</h2>
      <div className="mt-4 space-y-3">
        {alerts.map((a, i) => (
          <div key={i} className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            ⚠️ Te quedan <strong>{a.quantity}</strong> de {a.product} en {a.bar}.
          </div>
        ))}
        {alerts.length === 0 && <p className="text-sm text-white/35">Sin alertas por ahora.</p>}
      </div>
    </section>
  );
}

// =====================================================================
// UI
// =====================================================================

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="block text-xs text-white/40">
      {label}
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm text-white outline-none focus:border-emerald-400/50"
      />
    </label>
  );
}
