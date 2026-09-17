"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../../../lib/supabase/client";

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
  product: { name: string; category: string; brand: string | null; image_path: string | null; organization_id: string | null } | null;
};
type Bar = { id: string; name: string; created_at: string };
type BarStockRow = { bar_id: string; event_product_id: string; quantity: number };
type TableRow = { id: string; name: string; capacity: number | null; price_minor: number | null; status: string };
type Movement = { id: string; event_product_id: string; bar_id: string | null; type: string; quantity: number; reason: string | null; created_at: string };
type Bartender = { memberId: string; firstName: string; lastName: string; active: boolean; barId: string | null };
type Sale = {
  id: string; bar_id: string; event_product_id: string; quantity: number; unit_price_minor: number; total_minor: number;
  payment_method: string; created_at: string; table_id: string | null; bartenderName: string; tableName: string;
  cancelled_at: string | null; cancel_reason: string | null;
};
type MesaSale = {
  id: string; table_id: string | null; total_minor: number; status: string; payment_method: string; created_at: string;
  tableName: string; buyerName: string;
};

type Overview = {
  bars: Bar[];
  eventProducts: EventProduct[];
  barStock: BarStockRow[];
  tables: TableRow[];
  movements: Movement[];
  recentSales: Sale[];
  mesaSales: MesaSale[];
  bartenders: Bartender[];
};

const TABS = ["Stock general", "Barras", "Bartenders", "Mesas", "Movimientos", "Alertas", "Reportes", "Cierre de noche"] as const;
type Tab = (typeof TABS)[number];

function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

function productImageUrl(path: string | null | undefined) {
  if (!path) return null;
  return createClient().storage.from("product-assets").getPublicUrl(path).data.publicUrl;
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
    <main className="relative min-h-screen overflow-hidden bg-[#07050a] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-200px] top-[-150px] h-[500px] w-[500px] rounded-full bg-[#ff2a1a]/[0.14] blur-[130px]" />
        <div className="absolute bottom-[-200px] right-[-150px] h-[500px] w-[500px] rounded-full bg-[#ff5a2a]/[0.10] blur-[130px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1400px] px-5 py-8 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <Link href="/panel" className="text-xs text-white/40 hover:text-white">← Panel</Link>

            <div className="mt-4 flex items-center gap-3">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden">
                <div className="absolute inset-[5px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_24px_rgba(255,59,36,.25)]" />
                <div className="absolute inset-[7px] rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.6),transparent_35%)]" />
              </div>
              <div>
                <p className="text-[12px] font-black tracking-[0.1em]">
                  CAPITAL<span className="text-[#ff3b24]">PASS</span>
                </p>
                <p className="mt-0.5 text-[8px] uppercase tracking-[0.22em] text-white/25">Stock &amp; Barra</p>
              </div>
            </div>
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
                tab === t
                  ? "bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] text-white shadow-[0_0_20px_rgba(255,59,36,.3)]"
                  : "border border-white/10 bg-white/[0.03] text-white/50 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        {message && <div className="mt-5 rounded-xl border border-[#ff5a2a]/25 bg-[#ff3b24]/10 px-4 py-3 text-sm text-[#ffb199]">{message}</div>}
        {error && <div className="mt-5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {loading || !overview ? (
          <p className="mt-10 text-sm text-white/40">Cargando...</p>
        ) : (
          <div className="mt-7">
            {tab === "Stock general" && (
              <StockGeneralTab
                eventId={currentEventId}
                organizationId={organizationId}
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
              <MovimientosTab
                movements={overview.movements}
                sales={overview.recentSales}
                mesaSales={overview.mesaSales}
                eventProductById={eventProductById}
                barById={barById}
                onSaved={() => { notify("Listo."); reload(); }}
                onError={setError}
              />
            )}
            {tab === "Alertas" && (
              <AlertasTab bars={overview.bars} eventProducts={overview.eventProducts} barStock={overview.barStock} />
            )}
            {tab === "Reportes" && <ReportesTab eventId={currentEventId} />}
            {tab === "Cierre de noche" && (
              <CierreTab
                bars={overview.bars}
                eventProducts={overview.eventProducts}
                barStock={overview.barStock}
                onSaved={() => { notify("Cierre guardado."); reload(); }}
                onError={setError}
              />
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
  eventId, organizationId, catalog, eventProducts, onSaved, onError,
}: {
  eventId: string; organizationId: string; catalog: Product[]; eventProducts: EventProduct[];
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

  const [newProductName, setNewProductName] = useState("");
  const [newProductBrand, setNewProductBrand] = useState("");
  const [creatingProduct, setCreatingProduct] = useState(false);

  // Si el producto elegido ya tiene datos cargados para este evento, hay que
  // traerlos al formulario -- si no, "Guardar" pisa el stock/costo/umbral
  // existentes con lo que haya quedado tipeado del producto anterior.
  useEffect(() => {
    const existing = eventProducts.find((ep) => ep.product_id === productId);
    const catalogProduct = catalog.find((p) => p.id === productId);
    if (existing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCostPrice(String(existing.cost_price_minor));
      setServings(String(catalogProduct?.servings_per_bottle ?? 15));
      setMargin(String(existing.profit_margin_percent));
      setManualSalePrice(String(existing.sale_price_minor));
      setManualOverride(true);
      setTotalStock(String(existing.total_stock));
      setThreshold(String(existing.low_stock_threshold));
    } else {
      setCostPrice("0");
      setServings(String(catalogProduct?.servings_per_bottle ?? 15));
      setMargin("50");
      setManualSalePrice("0");
      setManualOverride(false);
      setTotalStock("0");
      setThreshold("5");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function createCustomProduct() {
    if (!newProductName.trim()) return;
    setCreatingProduct(true);
    try {
      const response = await fetch("/api/stock/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, name: newProductName.trim(), category: "bebida", brand: newProductBrand.trim() || null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setNewProductName("");
      setNewProductBrand("");
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo crear el producto.");
    } finally {
      setCreatingProduct(false);
    }
  }

  const costPerServing = servings && Number(servings) > 0 ? Number(costPrice) / Number(servings) : 0;
  // Ganancia como markup sobre el costo (ej: "le saco el 300%" = precio = costo x 4),
  // no como margen sobre el precio de venta (esa cuenta explota o da negativo a partir del 100%).
  const suggestedPrice = Math.round(costPerServing * (1 + Number(margin) / 100));
  const salePrice = manualOverride ? manualSalePrice : String(suggestedPrice || 0);

  const profit = Number(salePrice) - costPerServing;
  const profitPercent = costPerServing > 0 ? (profit / costPerServing) * 100 : 0;

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
            className="rounded-lg border border-[#ff5a2a]/25 bg-[#ff3b24]/10 px-3 py-2 text-xs font-bold text-[#ffb199]"
          >
            📄 Carta de tragos (PDF)
          </Link>
        </div>
        <div className="mt-4 divide-y divide-white/5">
          {eventProducts.length === 0 && <p className="py-4 text-sm text-white/35">Todavía no cargaste productos.</p>}
          {eventProducts.map((ep) => {
            const imageUrl = productImageUrl(ep.product?.image_path);
            const isOwn = ep.product?.organization_id === organizationId;
            return (
              <div key={ep.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/40">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-[9px] text-white/20">S/F</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold">{ep.product?.name ?? "Producto"}</p>
                    <p className="text-xs text-white/40">Costo {money(ep.cost_price_minor)} · Venta {money(ep.sale_price_minor)} · Stock total {ep.total_stock}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isOwn && <ImageUploadButton productId={ep.product_id} onUploaded={onSaved} onError={onError} />}
                  <span className="text-xs text-white/30">Alerta en {ep.low_stock_threshold}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.05] p-6">
        <h2 className="text-lg font-bold">Agregar / actualizar producto</h2>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-white/40">¿No está en la lista?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              value={newProductName} onChange={(e) => setNewProductName(e.target.value)} placeholder="Nombre del trago"
              className="h-10 rounded-lg border border-white/15 bg-black px-3 text-sm"
            />
            <input
              value={newProductBrand} onChange={(e) => setNewProductBrand(e.target.value)} placeholder="Marca (opcional)"
              className="h-10 rounded-lg border border-white/15 bg-black px-3 text-sm"
            />
          </div>
          <button
            type="button" disabled={creatingProduct || !newProductName.trim()} onClick={createCustomProduct}
            className="mt-2 h-9 rounded-lg border border-white/20 px-4 text-xs font-bold uppercase tracking-wide disabled:opacity-40"
          >
            {creatingProduct ? "Creando..." : "+ Agregar a mi catálogo"}
          </button>
        </div>

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

        <button type="button" disabled={saving} onClick={save} className="mt-5 h-12 w-full rounded-xl bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] text-sm font-black text-white disabled:opacity-40">
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
        <button type="button" disabled={saving} onClick={createBar} className="mt-3 h-12 w-full rounded-xl bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] text-sm font-black text-white disabled:opacity-40">
          + Crear barra
        </button>

        <div className="mt-6 space-y-2">
          {bars.map((bar) => (
            <div key={bar.id} className="rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold">{bar.name}</div>
          ))}
          {bars.length === 0 && <p className="text-sm text-white/35">Sin barras todavía.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.05] p-6">
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
        <button type="button" disabled={saving} onClick={assignStock} className="mt-4 h-12 w-full rounded-xl bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] text-sm font-black text-white disabled:opacity-40 sm:w-auto sm:px-8">
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
      <section className="rounded-2xl border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.05] p-6">
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
        <button type="button" disabled={saving || bars.length === 0} onClick={create} className="mt-5 h-12 w-full rounded-xl bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] text-sm font-black text-white disabled:opacity-40">
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
                className={`rounded-lg border px-3 py-2 text-xs font-bold ${bt.active ? "border-[#ff5a2a]/30 text-[#ffb199]" : "border-white/15 text-white/40"}`}
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
        <button type="button" disabled={saving} onClick={createTable} className="mt-4 h-12 w-full rounded-xl bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] text-sm font-black text-white disabled:opacity-40">
          + Crear mesa
        </button>
      </section>

      <section className="rounded-2xl border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.05] p-6">
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
                  <button type="button" onClick={() => setSellingTable(sellingTable === table.id ? null : table.id)} className="rounded-lg bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] px-3 py-2 text-xs font-black text-white">
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
                    <button type="button" onClick={() => setPaymentMethod("efectivo")} className={`h-11 rounded-lg border text-sm font-bold ${paymentMethod === "efectivo" ? "border-[#ff5a2a]/60 bg-[#ff3b24]/10 text-[#ffb199]" : "border-white/10"}`}>💵 Efectivo</button>
                    <button type="button" onClick={() => setPaymentMethod("transferencia")} className={`h-11 rounded-lg border text-sm font-bold ${paymentMethod === "transferencia" ? "border-[#ff5a2a]/60 bg-[#ff3b24]/10 text-[#ffb199]" : "border-white/10"}`}>🏦 Transferencia</button>
                  </div>
                  <button type="button" disabled={saving} onClick={sellTable} className="h-11 w-full rounded-lg bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] text-sm font-black text-white disabled:opacity-40">
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
  movements, sales, mesaSales, eventProductById, barById, onSaved, onError,
}: {
  movements: Movement[];
  sales: Sale[];
  mesaSales: MesaSale[];
  eventProductById: Map<string, EventProduct>;
  barById: Map<string, Bar>;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const typeLabel: Record<string, string> = {
    ingreso: "Ingreso", asignacion_barra: "Asignación a barra", venta: "Venta", ajuste: "Ajuste", perdida: "Pérdida",
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-lg font-bold">Ventas de barra</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-white/30">
                <th className="pb-2">Hora</th><th className="pb-2">Barra</th><th className="pb-2">Bebida</th><th className="pb-2">Cant.</th>
                <th className="pb-2">Mesa</th><th className="pb-2">Bartender</th><th className="pb-2">Precio</th><th className="pb-2">Pago</th><th className="pb-2">​</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className={`border-t border-white/5 ${s.cancelled_at ? "opacity-40" : ""}`}>
                  <td className="py-2 text-white/50">{new Date(s.created_at).toLocaleTimeString("es-AR")}</td>
                  <td className="py-2">{barById.get(s.bar_id)?.name ?? "—"}</td>
                  <td className="py-2">{eventProductById.get(s.event_product_id)?.product?.name ?? "—"}</td>
                  <td className="py-2 font-bold">{s.quantity}</td>
                  <td className="py-2 text-white/40">{s.tableName}</td>
                  <td className="py-2">{s.bartenderName}</td>
                  <td className="py-2 font-bold">{money(s.total_minor)}</td>
                  <td className="py-2 text-white/40">{s.payment_method === "efectivo" ? "Efectivo" : "Transferencia"}</td>
                  <td className="py-2">
                    {s.cancelled_at ? (
                      <span className="text-[10px] uppercase text-red-300">Cancelada</span>
                    ) : (
                      <CancelSaleButton endpoint="/api/stock/bar-sales/cancel" saleId={s.id} onCancelled={onSaved} onError={onError} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sales.length === 0 && <p className="py-4 text-sm text-white/35">Sin ventas de barra todavía.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-lg font-bold">Ventas de mesas</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-white/30">
                <th className="pb-2">Hora</th><th className="pb-2">Mesa</th><th className="pb-2">Cliente</th>
                <th className="pb-2">Precio</th><th className="pb-2">Pago</th><th className="pb-2">Estado</th><th className="pb-2">​</th>
              </tr>
            </thead>
            <tbody>
              {mesaSales.map((s) => (
                <tr key={s.id} className={`border-t border-white/5 ${s.status === "cancelled" ? "opacity-40" : ""}`}>
                  <td className="py-2 text-white/50">{new Date(s.created_at).toLocaleTimeString("es-AR")}</td>
                  <td className="py-2">{s.tableName}</td>
                  <td className="py-2">{s.buyerName}</td>
                  <td className="py-2 font-bold">{money(s.total_minor)}</td>
                  <td className="py-2 text-white/40">{s.payment_method === "efectivo" ? "Efectivo" : "Transferencia"}</td>
                  <td className="py-2 text-white/40">{s.status === "cancelled" ? "Cancelada" : "Confirmada"}</td>
                  <td className="py-2">
                    {s.status !== "cancelled" && (
                      <CancelSaleButton endpoint="/api/stock/tables/cancel" saleId={s.id} onCancelled={onSaved} onError={onError} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {mesaSales.length === 0 && <p className="py-4 text-sm text-white/35">Sin ventas de mesas todavía.</p>}
        </div>
      </section>

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
    </div>
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
// REPORTES
// =====================================================================

type Report = {
  topProducts: { name: string; quantity: number; totalMinor: number }[];
  byBar: { name: string; quantity: number; totalMinor: number }[];
  byPaymentMethod: { method: string; totalMinor: number }[];
  barTotalMinor: number;
  mesaTotalMinor: number;
};

function ReportesTab({ eventId }: { eventId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/stock/reports?eventId=${eventId}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "No se pudo cargar el reporte.");
        setReport(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el reporte.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [eventId]);

  if (loading) return <p className="text-sm text-white/40">Cargando reporte...</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!report) return null;

  const methodLabel: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia" };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-lg font-bold">Más vendido de la noche</h2>
        <div className="mt-4 space-y-2">
          {report.topProducts.map((p, i) => (
            <div key={i} className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="font-bold">{p.name}</span>
              <span className="text-sm text-white/40">{p.quantity} u. · {money(p.totalMinor)}</span>
            </div>
          ))}
          {report.topProducts.length === 0 && <p className="text-sm text-white/35">Sin ventas de barra todavía.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-lg font-bold">Por barra</h2>
        <div className="mt-4 space-y-2">
          {report.byBar.map((b, i) => (
            <div key={i} className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="font-bold">{b.name}</span>
              <span className="text-sm text-white/40">{b.quantity} u. · {money(b.totalMinor)}</span>
            </div>
          ))}
          {report.byBar.length === 0 && <p className="text-sm text-white/35">Sin ventas de barra todavía.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-lg font-bold">Por medio de pago</h2>
        <div className="mt-4 space-y-2">
          {report.byPaymentMethod.map((m, i) => (
            <div key={i} className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="font-bold">{methodLabel[m.method] ?? m.method}</span>
              <span className="text-sm text-white/40">{money(m.totalMinor)}</span>
            </div>
          ))}
          {report.byPaymentMethod.length === 0 && <p className="text-sm text-white/35">Sin ventas todavía.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.05] p-6">
        <h2 className="text-lg font-bold">Totales</h2>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between"><span className="text-white/40">Ventas de barra</span><span className="font-bold">{money(report.barTotalMinor)}</span></div>
          <div className="flex items-center justify-between"><span className="text-white/40">Ventas de mesas</span><span className="font-bold">{money(report.mesaTotalMinor)}</span></div>
          <div className="flex items-center justify-between border-t border-white/10 pt-2 text-base"><span className="font-bold">Total</span><span className="font-black">{money(report.barTotalMinor + report.mesaTotalMinor)}</span></div>
        </div>
      </section>
    </div>
  );
}

// =====================================================================
// CIERRE DE NOCHE
// =====================================================================

function CierreTab({
  bars, eventProducts, barStock, onSaved, onError,
}: {
  bars: Bar[]; eventProducts: EventProduct[]; barStock: BarStockRow[];
  onSaved: () => void; onError: (msg: string) => void;
}) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [savingBar, setSavingBar] = useState<string | null>(null);

  function key(barId: string, eventProductId: string) {
    return `${barId}:${eventProductId}`;
  }

  async function closeBar(barId: string) {
    const rows = barStock.filter((row) => row.bar_id === barId);
    const changes = rows
      .map((row) => {
        const counted = counts[key(barId, row.event_product_id)];
        if (counted === undefined || counted === "") return null;
        const delta = Number(counted) - row.quantity;
        if (delta === 0) return null;
        return { eventProductId: row.event_product_id, delta };
      })
      .filter((c): c is { eventProductId: string; delta: number } => c !== null);

    if (changes.length === 0) {
      onError("No cargaste ninguna diferencia para esta barra.");
      return;
    }

    setSavingBar(barId);
    try {
      const today = new Date().toLocaleDateString("es-AR");
      for (const change of changes) {
        const response = await fetch("/api/stock/adjust", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            barId, eventProductId: change.eventProductId, quantityDelta: change.delta,
            type: "ajuste", reason: `Cierre de noche ${today}`,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
      }
      setCounts((prev) => {
        const next = { ...prev };
        for (const row of rows) delete next[key(barId, row.event_product_id)];
        return next;
      });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar el cierre.");
    } finally {
      setSavingBar(null);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-white/40">
        Al terminar el evento, contá físicamente lo que queda de cada bebida en cada barra y cargalo acá. Solo se
        registra un ajuste para lo que tenga una diferencia contra el sistema — quedan guardados en Movimientos.
      </p>

      {bars.length === 0 && <p className="text-sm text-white/35">Todavía no creaste ninguna barra.</p>}

      {bars.map((bar) => {
        const rows = barStock.filter((row) => row.bar_id === bar.id);
        return (
          <section key={bar.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h2 className="text-lg font-bold">{bar.name}</h2>
            {rows.length === 0 ? (
              <p className="mt-3 text-sm text-white/35">Sin stock asignado a esta barra.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-white/30">
                      <th className="pb-2">Producto</th>
                      <th className="pb-2">Esperado (sistema)</th>
                      <th className="pb-2">Contado físicamente</th>
                      <th className="pb-2">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const ep = eventProducts.find((e) => e.id === row.event_product_id);
                      const counted = counts[key(bar.id, row.event_product_id)] ?? "";
                      const diff = counted === "" ? null : Number(counted) - row.quantity;
                      return (
                        <tr key={row.event_product_id} className="border-t border-white/5">
                          <td className="py-2">{ep?.product?.name ?? "—"}</td>
                          <td className="py-2 font-bold">{row.quantity}</td>
                          <td className="py-2">
                            <input
                              value={counted}
                              onChange={(e) => setCounts((prev) => ({ ...prev, [key(bar.id, row.event_product_id)]: e.target.value }))}
                              placeholder={String(row.quantity)}
                              className="h-9 w-20 rounded-lg border border-white/15 bg-black px-2 text-sm"
                            />
                          </td>
                          <td className={`py-2 font-bold ${diff === null ? "text-white/20" : diff === 0 ? "text-white/40" : diff > 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {diff === null ? "—" : diff > 0 ? `+${diff}` : diff}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button
                  type="button"
                  disabled={savingBar === bar.id}
                  onClick={() => closeBar(bar.id)}
                  className="mt-4 h-11 rounded-xl bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] px-6 text-sm font-black text-white disabled:opacity-40"
                >
                  {savingBar === bar.id ? "Guardando..." : `Guardar cierre de ${bar.name}`}
                </button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function CancelSaleButton({
  endpoint, saleId, onCancelled, onError,
}: {
  endpoint: string; saleId: string; onCancelled: () => void; onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  async function confirmCancel() {
    if (!reason.trim()) return;
    setCancelling(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleId, reason: reason.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setOpen(false);
      setReason("");
      onCancelled();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo cancelar la venta.");
    } finally {
      setCancelling(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-red-500/25 px-2 py-1 text-[10px] font-bold uppercase text-red-300">
        Cancelar
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo"
        className="h-7 w-24 rounded border border-white/15 bg-black px-2 text-[10px]"
      />
      <button type="button" disabled={cancelling || !reason.trim()} onClick={confirmCancel} className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-300 disabled:opacity-40">
        {cancelling ? "..." : "OK"}
      </button>
      <button type="button" onClick={() => { setOpen(false); setReason(""); }} className="text-[10px] text-white/30">✕</button>
    </div>
  );
}

function ImageUploadButton({
  productId, onUploaded, onError,
}: {
  productId: string; onUploaded: () => void; onError: (msg: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("productId", productId);
      form.append("file", file);
      const response = await fetch("/api/stock/products/image", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onUploaded();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <button
        type="button" disabled={uploading} onClick={() => inputRef.current?.click()}
        className="rounded-lg border border-white/15 px-2 py-1 text-[10px] font-bold uppercase text-white/50 disabled:opacity-40"
      >
        {uploading ? "..." : "📷 Foto"}
      </button>
    </>
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
        className="mt-1 h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50"
      />
    </label>
  );
}
