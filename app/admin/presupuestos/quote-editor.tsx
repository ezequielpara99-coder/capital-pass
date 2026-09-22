"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  computeTotals,
  contentCount,
  formatMoney,
  formatQuantity,
  itemTotal,
  KIND_LABEL,
  MODALITIES,
  MODALITY_LABEL,
  MONTHLY_DISCOUNT_LABEL,
  QUOTE_KINDS,
  QUOTE_STATUSES,
  quoteCode,
  STATUS_LABEL,
  UNITS,
  type DiscountType,
  type Modality,
  type PriceMode,
  type QuoteItem,
  type QuoteKind,
  type QuoteStatus,
} from "../../../lib/quotes/totals";

export type CatalogItem = { id: string; kind: QuoteKind; description: string; unit: string; unit_price_minor: number };
export type QuoteClient = { id: string; name: string; contact: string | null; phone: string | null; email: string | null };

// Forma del presupuesto tal como viene de la base (o vacío para uno nuevo).
export type QuoteInit = {
  id?: string;
  number?: number;
  kind: QuoteKind;
  status?: QuoteStatus;
  client_name?: string;
  client_contact?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  title?: string | null;
  event_name?: string | null;
  modality?: Modality | null;
  items?: QuoteItem[];
  price_mode?: PriceMode;
  package_price_minor?: number;
  discount_type?: DiscountType;
  discount_value?: number;
  discount_label?: string | null;
  notes?: string | null;
  valid_days?: number;
  rental_inquiry_id?: string | null;
};

type DiscountMode = "none" | "monthly" | "percent" | "amount";
type EditorItem = { key: string; description: string; quantity: string; unit: string; price: string };

const INPUT =
  "mt-2 h-12 w-full border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50";
const AREA =
  "mt-2 w-full border border-white/[0.12] bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50";
const LABEL = "block text-[9px] font-black uppercase tracking-[0.18em] text-white/40";
const MONTHLY_KEY = "cp_quote_monthly_pct";

let keyCounter = 0;
const nextKey = () => `i${Date.now()}-${keyCounter++}`;

function toNumber(value: string) {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyItem(kind: QuoteKind): EditorItem {
  return { key: nextKey(), description: "", quantity: "1", unit: kind === "rental" ? "mes" : "u", price: "" };
}

function readMonthlyPct() {
  try {
    const stored = window.localStorage.getItem(MONTHLY_KEY);
    if (stored && Number(stored) > 0) return stored;
  } catch {}
  return "10";
}

function initialDiscount(init: QuoteInit): { mode: DiscountMode; value: string } {
  if (init.discount_type === "percent") {
    return { mode: init.discount_label === MONTHLY_DISCOUNT_LABEL ? "monthly" : "percent", value: String(init.discount_value ?? 0) };
  }
  if (init.discount_type === "amount") return { mode: "amount", value: String(init.discount_value ?? 0) };
  return { mode: "none", value: "" };
}

export default function QuoteEditor({ init, catalog, clients }: { init: QuoteInit; catalog: CatalogItem[]; clients: QuoteClient[] }) {
  const isNew = !init.id;

  const [id, setId] = useState(init.id ?? null);
  const [number, setNumber] = useState(init.number ?? null);
  const [kind, setKind] = useState<QuoteKind>(init.kind);
  const [status, setStatus] = useState<QuoteStatus>(init.status ?? "borrador");
  const [clientName, setClientName] = useState(init.client_name ?? "");
  const [clientContact, setClientContact] = useState(init.client_contact ?? "");
  const [clientPhone, setClientPhone] = useState(init.client_phone ?? "");
  const [clientEmail, setClientEmail] = useState(init.client_email ?? "");
  const [title, setTitle] = useState(init.title ?? "");
  const [eventName, setEventName] = useState(init.event_name ?? "");
  const [modality, setModality] = useState<Modality | "">(init.modality ?? (init.kind === "diseno" ? "eventual" : ""));
  const [priceMode, setPriceMode] = useState<PriceMode>(init.price_mode ?? (init.kind === "diseno" ? "package" : "items"));
  const [packagePrice, setPackagePrice] = useState(init.package_price_minor ? String(init.package_price_minor) : "");
  const [items, setItems] = useState<EditorItem[]>(() =>
    init.items && init.items.length > 0
      ? init.items.map((item) => ({
          key: nextKey(),
          description: item.description,
          quantity: String(item.quantity),
          unit: item.unit,
          price: item.unit_price_minor ? String(item.unit_price_minor) : "",
        }))
      : [emptyItem(init.kind)]
  );
  const [discount, setDiscount] = useState(() => initialDiscount(init));
  const [notes, setNotes] = useState(init.notes ?? "");
  const [validDays, setValidDays] = useState(String(init.valid_days ?? 15));

  const [busy, setBusy] = useState<"" | "save" | "pdf" | "share" | "client">("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [clientList, setClientList] = useState(clients);
  const [selectedClientId, setSelectedClientId] = useState("");

  const isDesign = kind === "diseno";
  const showPrices = priceMode === "items";

  const parsedItems: QuoteItem[] = useMemo(
    () =>
      items
        .filter((item) => item.description.trim())
        .map((item) => ({
          description: item.description.trim(),
          quantity: toNumber(item.quantity) > 0 ? toNumber(item.quantity) : 1,
          unit: item.unit,
          unit_price_minor: Math.max(0, Math.round(toNumber(item.price))),
        })),
    [items]
  );

  const discountType: DiscountType = discount.mode === "none" ? "none" : discount.mode === "amount" ? "amount" : "percent";
  const discountValue = toNumber(discount.value);
  const totals = computeTotals(parsedItems, discountType, discountValue, showPrices ? null : Math.round(toNumber(packagePrice)));
  const pieces = contentCount(parsedItems);

  function updateItem(key: string, patch: Partial<EditorItem>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function changeKind(next: QuoteKind) {
    setKind(next);
    if (next === "diseno") {
      if (!modality) setModality("eventual");
      setPriceMode("package");
    } else {
      setPriceMode("items");
    }
  }

  function chooseDiscountMode(mode: DiscountMode) {
    if (mode === "monthly") setDiscount({ mode, value: readMonthlyPct() });
    else if (mode === "none") setDiscount({ mode, value: "" });
    else setDiscount((prev) => ({ mode, value: prev.mode === "monthly" || prev.mode === "none" ? "" : prev.value }));
  }

  function changeDiscountValue(value: string) {
    setDiscount((prev) => ({ ...prev, value }));
    if (discount.mode === "monthly" && toNumber(value) > 0) {
      try {
        window.localStorage.setItem(MONTHLY_KEY, String(toNumber(value)));
      } catch {}
    }
  }

  function addFromCatalog(catalogId: string) {
    const entry = catalog.find((item) => item.id === catalogId);
    if (!entry) return;
    setItems((prev) => [
      ...prev.filter((item) => item.description.trim() || item.price),
      {
        key: nextKey(),
        description: entry.description,
        quantity: "1",
        unit: entry.unit,
        price: entry.unit_price_minor ? String(entry.unit_price_minor) : "",
      },
    ]);
  }

  function applyClient(clientId: string) {
    setSelectedClientId(clientId);
    const found = clientList.find((c) => c.id === clientId);
    if (!found) return;
    setClientName(found.name);
    setClientContact(found.contact ?? "");
    setClientPhone(found.phone ?? "");
    setClientEmail(found.email ?? "");
  }

  async function saveClientToDirectory() {
    if (!clientName.trim() || busy) return;
    setBusy("client");
    setError("");
    try {
      const isUpdate = selectedClientId && clientList.some((c) => c.id === selectedClientId);
      const response = await fetch("/api/admin/presupuestos/clientes", {
        method: isUpdate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isUpdate ? { id: selectedClientId } : {}),
          name: clientName,
          contact: clientContact,
          phone: clientPhone,
          email: clientEmail,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar el cliente.");

      setClientList((prev) => {
        const next = isUpdate ? prev.map((c) => (c.id === result.client.id ? result.client : c)) : [...prev, result.client];
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
      setSelectedClientId(result.client.id);
      setSaved(isUpdate ? "Cliente actualizado ✓" : "Cliente guardado en el directorio ✓");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el cliente.");
    } finally {
      setBusy("");
    }
  }

  function payload() {
    return {
      kind,
      status,
      clientName,
      clientContact,
      clientPhone,
      clientEmail,
      title: isDesign ? "" : title,
      eventName: isDesign ? eventName : "",
      modality: isDesign ? modality : "",
      items: parsedItems,
      priceMode,
      packagePrice: Math.round(toNumber(packagePrice)),
      discountType,
      discountValue,
      discountLabel: discount.mode === "monthly" ? MONTHLY_DISCOUNT_LABEL : "",
      notes,
      validDays: toNumber(validDays),
      rentalInquiryId: init.rental_inquiry_id ?? "",
    };
  }

  async function save(): Promise<string | null> {
    if (!clientName.trim()) {
      setError("Ingresá el nombre del cliente.");
      return null;
    }

    setError("");
    setSaved("");
    try {
      const response = await fetch(id ? `/api/admin/presupuestos/${id}` : "/api/admin/presupuestos", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");

      setId(result.quote.id);
      setNumber(result.quote.number);
      setSaved("Guardado ✓");
      // Deja la URL del presupuesto guardado sin volver a montar el editor.
      if (!id) window.history.replaceState(null, "", `/admin/presupuestos/${result.quote.id}`);
      return result.quote.id as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      return null;
    }
  }

  async function onSave() {
    if (busy) return;
    setBusy("save");
    await save();
    setBusy("");
  }

  async function fetchPdf(quoteId: string) {
    const response = await fetch(`/api/admin/presupuestos/${quoteId}/pdf`);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error ?? "No se pudo generar el PDF.");
    }
    return response.blob();
  }

  function fileName() {
    const label = number ? quoteCode(number) : "presupuesto";
    const client = clientName.trim().normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40);
    return `Presupuesto-${label}${client ? `-${client}` : ""}.pdf`;
  }

  async function onDownload() {
    if (busy) return;
    setBusy("pdf");
    try {
      const quoteId = await save();
      if (!quoteId) return;
      const blob = await fetchPdf(quoteId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el PDF.");
    } finally {
      setBusy("");
    }
  }

  // En el celular abre el menú de compartir (WhatsApp, mail...) con el PDF adjunto.
  async function onShare() {
    if (busy) return;
    setBusy("share");
    try {
      const quoteId = await save();
      if (!quoteId) return;
      const blob = await fetchPdf(quoteId);
      const file = new File([blob], fileName(), { type: "application/pdf" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `Presupuesto ${clientName}` });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setSaved("Este navegador no puede compartir archivos: se descargó el PDF.");
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "No se pudo compartir el PDF.");
      }
    } finally {
      setBusy("");
    }
  }

  const catalogForKind = catalog.filter((item) => item.kind === kind || item.kind === "otro" || kind === "otro");

  return (
    <main className="relative min-h-screen bg-[#050505] pb-44 text-[#f7f3ed] sm:pb-32">
      <section className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <header className="border-b border-white/[0.07] pb-6">
          <Link href="/admin/presupuestos" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Presupuestos
          </Link>
          <p className={`mt-6 text-[9px] font-black uppercase tracking-[0.22em] ${isDesign ? "text-violet-300" : "text-[#ff7354]"}`}>
            {isDesign ? "Capital Design" : "Capital Rentals"}
            {number ? ` · ${quoteCode(number)}` : ""}
          </p>
          <h1 className="mt-2 text-[clamp(30px,5vw,52px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">
            {isNew && !id ? "Nuevo presupuesto." : "Presupuesto."}
          </h1>
        </header>

        {/* Tipo */}
        <div className="mt-6 grid grid-cols-3 gap-2">
          {QUOTE_KINDS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => changeKind(value)}
              className={`h-12 border px-2 text-[10px] font-black uppercase tracking-[0.1em] transition ${
                kind === value
                  ? value === "diseno"
                    ? "border-violet-400/60 bg-violet-500/20 text-violet-100"
                    : "border-[#ff5a2a]/60 bg-[#ff3b24]/15 text-[#ffc0ad]"
                  : "border-white/[0.12] text-white/40 hover:text-white"
              }`}
            >
              {KIND_LABEL[value]}
            </button>
          ))}
        </div>

        {/* Cliente */}
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Cliente</h2>

            {clientList.length > 0 && (
              <select
                value={selectedClientId}
                onChange={(e) => applyClient(e.target.value)}
                className="h-9 border border-white/[0.14] bg-transparent px-3 text-[10px] font-black uppercase tracking-[0.1em] text-white/60 outline-none"
              >
                <option value="" className="bg-[#0a0908]">
                  + Del directorio…
                </option>
                {clientList.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#0a0908]">
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="mt-2 grid gap-x-4 gap-y-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={LABEL}>{isDesign ? "Cliente (nombre del boliche / productora)" : "Negocio o cliente"} *</span>
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={INPUT} placeholder={isDesign ? "primavera estudiantil" : "Bar Los Álamos"} />
            </label>

            {isDesign && (
              <>
                <label className="block sm:col-span-2">
                  <span className={LABEL}>Nombre de la fiesta</span>
                  <input value={eventName} onChange={(e) => setEventName(e.target.value)} className={INPUT} placeholder="Fiesta de la primavera · Parque de la Costa" />
                </label>

                <div className="sm:col-span-2">
                  <span className={LABEL}>Modalidad</span>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {MODALITIES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setModality(value)}
                        className={`h-12 border text-[10px] font-black uppercase tracking-[0.1em] transition ${
                          modality === value ? "border-violet-400/60 bg-violet-500/20 text-violet-100" : "border-white/[0.12] text-white/40 hover:text-white"
                        }`}
                      >
                        {MODALITY_LABEL[value]}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {!isDesign && (
              <label className="block sm:col-span-2">
                <span className={LABEL}>Título del presupuesto</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} placeholder="Alquiler de 3 terminales de pago" />
              </label>
            )}

            <label className="block">
              <span className={LABEL}>Contacto</span>
              <input value={clientContact} onChange={(e) => setClientContact(e.target.value)} className={INPUT} />
            </label>
            <label className="block">
              <span className={LABEL}>Teléfono</span>
              <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} inputMode="tel" className={INPUT} />
            </label>
            <label className="block sm:col-span-2">
              <span className={LABEL}>Email</span>
              <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} inputMode="email" className={INPUT} />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveClientToDirectory}
              disabled={Boolean(busy) || !clientName.trim()}
              className="h-10 border border-white/[0.16] px-4 text-[10px] font-black uppercase tracking-[0.12em] text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-40"
            >
              {busy === "client" ? "Guardando…" : selectedClientId ? "Actualizar en el directorio" : "+ Guardar en el directorio"}
            </button>
            <Link href="/admin/presupuestos/clientes" className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/35 underline underline-offset-4 hover:text-white/60">
              Ver directorio completo
            </Link>
          </div>
        </section>

        {/* Contenido / items */}
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">{isDesign ? "Contenido" : "Detalle"}</h2>
              {isDesign && pieces > 0 && (
                <p className="mt-1 text-xs text-white/40">{formatQuantity(pieces)} {pieces === 1 ? "pieza" : "piezas"} de contenido</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1 border border-white/[0.12] p-1 text-[9px] font-black uppercase tracking-[0.1em]">
              {(["package", "items"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPriceMode(mode)}
                  className={`h-9 px-3 transition ${priceMode === mode ? "bg-white text-black" : "text-white/45 hover:text-white"}`}
                >
                  {mode === "package" ? "Precio cerrado" : "Precio por ítem"}
                </button>
              ))}
            </div>
          </div>

          {!showPrices && (
            <label className="mt-4 block">
              <span className={LABEL}>Precio total del paquete ($)</span>
              <input
                value={packagePrice}
                onChange={(e) => setPackagePrice(e.target.value)}
                inputMode="numeric"
                className={INPUT}
                placeholder="200000"
              />
            </label>
          )}

          <div className="mt-4 space-y-3">
            {items.map((item, index) => (
              <div key={item.key} className="border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-3 w-5 text-xs font-black text-white/25">{index + 1}</span>
                  <textarea
                    value={item.description}
                    onChange={(e) => updateItem(item.key, { description: e.target.value })}
                    rows={2}
                    placeholder={isDesign ? "Ej: FLYER PREVENTA" : "Ej: Alquiler de terminal de pago"}
                    className="mt-0 w-full border border-white/[0.12] bg-black/30 px-3 py-2.5 text-sm leading-5 text-white outline-none placeholder:text-white/20 focus:border-[#ff5a2a]/50"
                  />
                  <button
                    type="button"
                    aria-label="Quitar"
                    onClick={() => setItems((prev) => (prev.length > 1 ? prev.filter((row) => row.key !== item.key) : [emptyItem(kind)]))}
                    className="h-11 w-11 shrink-0 border border-white/[0.10] text-lg text-white/40 hover:text-red-300"
                  >
                    ×
                  </button>
                </div>

                <div className={`mt-3 grid gap-3 pl-8 ${showPrices ? "grid-cols-3" : ""}`}>
                  <label className={`block ${showPrices ? "" : "max-w-[160px]"}`}>
                    <span className={LABEL}>Cantidad</span>
                    <input
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                      inputMode="decimal"
                      className="mt-2 h-11 w-full border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50"
                    />
                  </label>

                  {showPrices && (
                    <>
                      <label className="block">
                        <span className={LABEL}>Unidad</span>
                        <select
                          value={item.unit}
                          onChange={(e) => updateItem(item.key, { unit: e.target.value })}
                          className="mt-2 h-11 w-full border border-white/[0.12] bg-black/30 px-2 text-sm text-white outline-none focus:border-[#ff5a2a]/50"
                        >
                          {[...new Set([...UNITS, item.unit])].map((unit) => (
                            <option key={unit} value={unit} className="bg-[#0a0908]">
                              {unit}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className={LABEL}>Precio unit. ($)</span>
                        <input
                          value={item.price}
                          onChange={(e) => updateItem(item.key, { price: e.target.value })}
                          inputMode="numeric"
                          className="mt-2 h-11 w-full border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50"
                        />
                      </label>
                    </>
                  )}
                </div>

                {showPrices && toNumber(item.price) > 0 && (
                  <p className="mt-2 pl-8 text-right text-xs font-bold text-white/50">
                    {formatMoney(itemTotal({ quantity: toNumber(item.quantity) || 1, unit_price_minor: toNumber(item.price) }))}
                  </p>
                )}

                {index === items.length - 1 && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
                    <button
                      type="button"
                      onClick={() => setItems((prev) => [...prev, emptyItem(kind)])}
                      className="h-10 flex-1 min-w-[140px] border border-white/[0.16] text-[10px] font-black uppercase tracking-[0.12em] text-white/75 transition hover:border-white/40 hover:text-white"
                    >
                      + Agregar ítem
                    </button>
                    <button
                      type="button"
                      onClick={onSave}
                      disabled={Boolean(busy)}
                      className="h-10 flex-1 min-w-[140px] border border-emerald-400/30 bg-emerald-400/10 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-40"
                    >
                      {busy === "save" ? "Guardando…" : "Guardar ítem"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, emptyItem(kind)])}
              className="h-11 border border-white/[0.14] px-5 text-[10px] font-black uppercase tracking-[0.14em] text-white/70 transition hover:border-white/40 hover:text-white"
            >
              + Agregar línea
            </button>

            {catalogForKind.length > 0 && (
              <select
                value=""
                onChange={(e) => addFromCatalog(e.target.value)}
                className="h-11 border border-white/[0.14] bg-transparent px-3 text-[10px] font-black uppercase tracking-[0.1em] text-white/60 outline-none"
              >
                <option value="" className="bg-[#0a0908]">
                  + Del catálogo…
                </option>
                {catalogForKind.map((entry) => (
                  <option key={entry.id} value={entry.id} className="bg-[#0a0908]">
                    {entry.description}
                    {entry.unit_price_minor ? ` · ${formatMoney(entry.unit_price_minor)}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>

        {/* Descuento */}
        <section className="mt-10">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Descuento</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ["none", "Sin descuento"],
                ["monthly", "Cliente mensual"],
                ["percent", "Otro %"],
                ["amount", "Monto fijo $"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => chooseDiscountMode(mode)}
                className={`h-12 border px-2 text-[10px] font-black uppercase tracking-[0.08em] transition ${
                  discount.mode === mode ? "border-white/50 bg-white/10 text-white" : "border-white/[0.12] text-white/40 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {discount.mode !== "none" && (
            <label className="mt-3 block">
              <span className={LABEL}>{discount.mode === "amount" ? "Monto a descontar ($)" : "Porcentaje (%)"}</span>
              <input value={discount.value} onChange={(e) => changeDiscountValue(e.target.value)} inputMode="decimal" className={INPUT} />
              {discount.mode === "monthly" && (
                <span className="mt-2 block text-[11px] text-white/35">Se recuerda este porcentaje para los próximos presupuestos de clientes mensuales.</span>
              )}
            </label>
          )}

          {isDesign && modality === "mensual" && discount.mode === "none" && (
            <button type="button" onClick={() => chooseDiscountMode("monthly")} className="mt-3 text-xs font-bold text-violet-300 underline underline-offset-4">
              Es cliente mensual: aplicar el descuento de cliente mensual
            </button>
          )}
        </section>

        {/* Notas */}
        <section className="mt-10">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Notas y condiciones</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className={AREA}
            placeholder="Forma de pago, plazos de entrega, qué incluye..."
          />
          <div className="mt-4 grid gap-x-4 gap-y-4 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL}>Validez (días)</span>
              <input value={validDays} onChange={(e) => setValidDays(e.target.value)} inputMode="numeric" className={INPUT} />
            </label>
            {id && (
              <label className="block">
                <span className={LABEL}>Estado</span>
                <select value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus)} className={INPUT}>
                  {QUOTE_STATUSES.map((value) => (
                    <option key={value} value={value} className="bg-[#0a0908]">
                      {STATUS_LABEL[value]}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </section>
      </section>

      {/* Barra fija: total + acciones */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.10] bg-[#0a0908]/95 backdrop-blur-md">
        <div className="mx-auto grid w-full max-w-[900px] grid-cols-[1fr_auto] items-center gap-2 px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:flex sm:flex-wrap sm:gap-3 md:px-8">
          <div className="mr-auto min-w-[120px]">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/35">
              Total{totals.discount > 0 ? ` (−${formatMoney(totals.discount)})` : ""}
            </p>
            <p className="text-xl font-black leading-tight">{formatMoney(totals.total)}</p>
          </div>

          {(error || saved) && (
            <p className={`col-span-2 text-xs sm:order-none sm:w-auto ${error ? "text-red-300" : "text-emerald-300"}`}>{error || saved}</p>
          )}

          <button
            type="button"
            onClick={onSave}
            disabled={Boolean(busy)}
            className="h-11 border border-white/[0.18] px-4 text-[10px] font-black uppercase tracking-[0.14em] text-white/80 transition hover:text-white disabled:opacity-40"
          >
            {busy === "save" ? "Guardando…" : "Guardar"}
          </button>
          <div className="col-span-2 grid grid-cols-2 gap-2 sm:contents">
            <button
              type="button"
              onClick={onShare}
              disabled={Boolean(busy)}
              className="h-11 border border-emerald-400/30 bg-emerald-400/10 px-4 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-40"
            >
              {busy === "share" ? "Preparando…" : "Compartir"}
            </button>
            <button
              type="button"
              onClick={onDownload}
              disabled={Boolean(busy)}
              className={`h-11 px-4 text-[10px] font-black uppercase tracking-[0.14em] text-white transition disabled:opacity-40 sm:px-5 ${
                isDesign ? "bg-violet-600 hover:bg-violet-500" : "bg-[#ff2a1a] hover:bg-[#ff4a2d]"
              }`}
            >
              {busy === "pdf" ? "Generando…" : "Descargar PDF"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
