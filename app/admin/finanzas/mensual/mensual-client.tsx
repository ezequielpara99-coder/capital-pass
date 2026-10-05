"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  DOLLAR_LABEL,
  itemInPesos,
  summarizeMonth,
  effectiveDay,
  type DollarRates,
  type DollarType,
  type FixedItem,
  type FixedKind,
  type FixedScope,
} from "../../../../lib/finanzas/fixed";

type Tab = FixedScope | "todo";
type Today = { day: number; daysInMonth: number; month: number; year: number };

const CATEGORIES: Record<FixedKind, string[]> = {
  gasto: ["Servicios digitales", "Impuestos", "Alquiler", "Sueldos", "Servicios (luz, gas, internet)", "Publicidad", "Transporte", "Comida", "Tarjeta / préstamos", "Otros"],
  ingreso: ["Clientes fijos", "Suscripciones Capital Pass", "Sueldo", "Alquileres", "Otros"],
};

const EMPTY_FORM = {
  id: "",
  scope: "negocio" as FixedScope,
  kind: "gasto" as FixedKind,
  name: "",
  category: "Servicios digitales",
  amount: "",
  currency: "ARS" as "ARS" | "USD",
  dollarType: "tarjeta" as DollarType,
  ivaExterior: false,
  dayOfMonth: "",
  notes: "",
};

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

function usd(value: number) {
  return `US$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value)}`;
}

export default function MensualClient() {
  const [items, setItems] = useState<FixedItem[] | null>(null);
  const [rates, setRates] = useState<DollarRates | null>(null);
  const [today, setToday] = useState<Today | null>(null);
  const [negocioReal, setNegocioReal] = useState<{ cobrado: number; gastos: number } | null>(null);
  const [tab, setTab] = useState<Tab>("todo");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/finanzas/fijos", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudieron cargar las cuentas.");
      setItems(data.items as FixedItem[]);
      setRates(data.rates as DollarRates | null);
      setToday(data.today as Today);
      setNegocioReal(data.negocioReal ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las cuentas.");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    // Carga inicial: el setState ocurre cuando responde la API (no en el
    // cuerpo del efecto).
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visible = useMemo(() => (items ?? []).filter((item) => tab === "todo" || item.scope === tab), [items, tab]);
  const summary = useMemo(() => (today ? summarizeMonth(visible, rates, today) : null), [visible, rates, today]);

  function openNew(kind: FixedKind) {
    setForm({ ...EMPTY_FORM, kind, scope: tab === "personal" ? "personal" : "negocio", category: CATEGORIES[kind][0] });
    setFormOpen(true);
    setError("");
  }

  function openEdit(item: FixedItem) {
    setForm({
      id: item.id,
      scope: item.scope,
      kind: item.kind,
      name: item.name,
      category: item.category,
      amount: String(item.amount),
      currency: item.currency,
      dollarType: item.dollar_type,
      ivaExterior: item.iva_exterior,
      dayOfMonth: item.day_of_month ? String(item.day_of_month) : "",
      notes: item.notes ?? "",
    });
    setFormOpen(true);
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        id: form.id || undefined,
        scope: form.scope,
        kind: form.kind,
        name: form.name,
        category: form.category,
        amount: Number(form.amount.replace(",", ".")),
        currency: form.currency,
        dollarType: form.dollarType,
        ivaExterior: form.ivaExterior,
        dayOfMonth: form.dayOfMonth,
        notes: form.notes,
      };
      const response = await fetch("/api/admin/finanzas/fijos", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo guardar.");
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: FixedItem) {
    const response = await fetch("/api/admin/finanzas/fijos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, active: !item.active }),
    });
    if (response.ok) await load();
  }

  async function remove(item: FixedItem) {
    if (!window.confirm(`¿Borrar "${item.name}"? No se puede deshacer.`)) return;
    const response = await fetch(`/api/admin/finanzas/fijos?id=${item.id}`, { method: "DELETE" });
    if (response.ok) await load();
  }

  const monthLabel = today ? `${MONTHS[today.month - 1]} ${today.year}` : "";
  const ingresos = visible.filter((item) => item.kind === "ingreso");
  const gastos = visible.filter((item) => item.kind === "gasto");

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[1100px] px-4 py-8 md:px-8">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href="/admin/finanzas" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Finanzas
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass admin</p>
          <h1 className="mt-3 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Cuentas del mes.</h1>
          <p className="mt-3 max-w-2xl text-sm text-white/45">
            Tus ingresos y gastos fijos de cada mes, del negocio y personales. Lo que está en dólares se pasa a pesos con la cotización de hoy, y te dice cuánto llevás gastado en {monthLabel || "el mes"}.
          </p>
        </header>

        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {/* DOLAR DEL DIA */}
        <section className="mt-6 grid gap-[1px] overflow-hidden border border-white/[0.08] bg-white/[0.08] sm:grid-cols-4">
          {(["tarjeta", "blue", "mep", "oficial"] as DollarType[]).map((type) => (
            <div key={type} className="bg-[#090807] p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/35">{DOLLAR_LABEL[type]}</p>
              <p className={`mt-2 text-xl font-black ${type === "tarjeta" ? "text-[#ffc0ad]" : ""}`}>{rates ? money(rates[type]) : "—"}</p>
            </div>
          ))}
        </section>
        <p className="mt-2 text-[11px] text-white/35">
          {rates
            ? `Cotización de venta de hoy (dolarapi.com${rates.updatedAt ? `, actualizada ${new Date(rates.updatedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}` : ""}). El dólar tarjeta ya incluye la percepción del 30%.`
            : "No se pudo traer la cotización del dólar ahora: lo que está en dólares no se suma hasta que vuelva."}
        </p>

        {/* PESTAÑAS */}
        <div className="mt-8 flex flex-wrap gap-2">
          {(
            [
              ["todo", "Todo"],
              ["negocio", "Negocio"],
              ["personal", "Personal"],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`h-10 px-5 text-[10px] font-black uppercase tracking-[0.15em] transition ${tab === value ? "bg-[#ff3b24] text-white" : "border border-white/[0.14] text-white/60 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* RESUMEN */}
        {summary && (
          <section className="mt-5 grid gap-[1px] overflow-hidden border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Ingresos fijos" value={money(summary.ingresos)} detail={`${money(summary.ingresadoHastaHoy)} ya entraron`} tone="good" />
            <Metric label="Gastos fijos" value={money(summary.gastos)} detail={`${money(summary.faltaPagar)} te falta pagar`} tone="bad" />
            <Metric label="Llevás gastado" value={money(summary.gastadoHastaHoy)} detail={`al ${today?.day} de ${MONTHS[(today?.month ?? 1) - 1]}`} />
            <Metric label="Te queda" value={money(summary.resultado)} detail="ingresos menos gastos fijos" tone={summary.resultado >= 0 ? "good" : "bad"} />
          </section>
        )}
        {summary && summary.sinCotizacion > 0 && (
          <p className="mt-2 text-[11px] text-amber-300">{summary.sinCotizacion} cuenta(s) en dólares no se sumaron porque no hay cotización ahora.</p>
        )}

        {tab !== "personal" && negocioReal && (
          <div className="mt-4 border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-white/55">
            Además, este mes en el negocio: <b className="text-white/80">{money(negocioReal.cobrado)}</b> cobrados de presupuestos y{" "}
            <b className="text-white/80">{money(negocioReal.gastos)}</b> en gastos cargados en{" "}
            <Link href="/admin/finanzas" className="underline decoration-white/30 hover:text-white">Finanzas</Link> (no están sumados arriba).
          </div>
        )}

        {/* LISTAS */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <ItemList title="Ingresos" kind="ingreso" items={ingresos} rates={rates} today={today} onNew={() => openNew("ingreso")} onEdit={openEdit} onToggle={toggleActive} onRemove={remove} />
          <ItemList title="Gastos" kind="gasto" items={gastos} rates={rates} today={today} onNew={() => openNew("gasto")} onEdit={openEdit} onToggle={toggleActive} onRemove={remove} />
        </div>
        {items === null && <div className="mt-6 border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Cargando…</div>}
      </section>

      {/* FORMULARIO */}
      {formOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/80 px-4 py-6 backdrop-blur-sm">
          <div className="flex min-h-full items-center justify-center">
            <form onSubmit={save} className="w-full max-w-lg border border-white/[0.12] bg-[#0b0908] p-6">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#ff7354]">{form.id ? "Editar" : "Nuevo"} {form.kind === "ingreso" ? "ingreso" : "gasto"} fijo</p>

              <div className="mt-5 grid grid-cols-2 gap-2">
                {(["negocio", "personal"] as FixedScope[]).map((scope) => (
                  <button key={scope} type="button" onClick={() => setForm({ ...form, scope })} className={`h-10 text-[10px] font-black uppercase tracking-[0.12em] ${form.scope === scope ? "bg-white text-black" : "border border-white/[0.14] text-white/60"}`}>
                    {scope === "negocio" ? "Negocio" : "Personal"}
                  </button>
                ))}
              </div>

              <Input label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} placeholder={form.kind === "gasto" ? "Ej: Claude, Monotributo, Alquiler" : "Ej: Cliente boliche X"} />

              <label className="mt-4 block">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">Categoría</span>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-2 h-11 w-full border border-white/[0.12] bg-black px-3 text-sm">
                  {[...new Set([...CATEGORIES[form.kind], form.category])].map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                <Input label="Monto" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} placeholder="0" inputMode="decimal" />
                <div className="mt-4 flex items-end gap-1">
                  {(["ARS", "USD"] as const).map((currency) => (
                    <button key={currency} type="button" onClick={() => setForm({ ...form, currency })} className={`h-11 px-4 text-xs font-black ${form.currency === currency ? "bg-white text-black" : "border border-white/[0.14] text-white/60"}`}>
                      {currency === "ARS" ? "$" : "US$"}
                    </button>
                  ))}
                </div>
              </div>

              {form.currency === "USD" && (
                <label className="mt-4 block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">Pasar a pesos con</span>
                  <select value={form.dollarType} onChange={(e) => setForm({ ...form, dollarType: e.target.value as DollarType })} className="mt-2 h-11 w-full border border-white/[0.12] bg-black px-3 text-sm">
                    {(["tarjeta", "blue", "mep", "oficial"] as DollarType[]).map((type) => (
                      <option key={type} value={type}>
                        {DOLLAR_LABEL[type]}
                        {rates ? ` (${money(rates[type])})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {form.kind === "gasto" && (
                <label className="mt-4 flex items-start gap-3 text-sm text-white/70">
                  <input type="checkbox" checked={form.ivaExterior} onChange={(e) => setForm({ ...form, ivaExterior: e.target.checked })} className="mt-1 h-4 w-4" />
                  <span>
                    Suma IVA 21% de servicio digital del exterior
                    <span className="block text-xs text-white/40">Para suscripciones como Netflix, Spotify, Claude o Google pagadas con tarjeta.</span>
                  </span>
                </label>
              )}

              <Input label="Día del mes (opcional)" value={form.dayOfMonth} onChange={(dayOfMonth) => setForm({ ...form, dayOfMonth })} placeholder="Ej: 10" inputMode="numeric" />
              <Input label="Notas (opcional)" value={form.notes} onChange={(notes) => setForm({ ...form, notes })} placeholder="" />

              {error && <div className="mt-4 border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}

              <div className="mt-6 flex gap-2">
                <button type="submit" disabled={saving} className="h-12 flex-1 bg-[#ff3b24] text-[11px] font-black uppercase tracking-[0.18em] text-white disabled:opacity-50">
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                <button type="button" onClick={() => setFormOpen(false)} className="h-12 border border-white/[0.14] px-5 text-[11px] font-black uppercase tracking-[0.18em] text-white/60">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-[#ffc0ad]" : "text-white";
  return (
    <article className="bg-[#090807] p-5">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/35">{label}</p>
      <p className={`mt-3 text-2xl font-black tracking-[-0.03em] ${color}`}>{value}</p>
      <p className="mt-1 text-[11px] text-white/35">{detail}</p>
    </article>
  );
}

function Input({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; inputMode?: "decimal" | "numeric" }) {
  return (
    <label className="mt-4 block">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} className="mt-2 h-11 w-full border border-white/[0.12] bg-black px-3 text-sm text-white outline-none focus:border-white/40" />
    </label>
  );
}

function ItemList({
  title,
  kind,
  items,
  rates,
  today,
  onNew,
  onEdit,
  onToggle,
  onRemove,
}: {
  title: string;
  kind: FixedKind;
  items: FixedItem[];
  rates: DollarRates | null;
  today: Today | null;
  onNew: () => void;
  onEdit: (item: FixedItem) => void;
  onToggle: (item: FixedItem) => void;
  onRemove: (item: FixedItem) => void;
}) {
  return (
    <section className="border border-white/[0.08] bg-[#090807]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
        <h2 className="text-lg font-black uppercase tracking-[-0.02em]">{title}</h2>
        <button type="button" onClick={onNew} className={`h-9 px-4 text-[10px] font-black uppercase tracking-[0.14em] ${kind === "ingreso" ? "bg-emerald-500/15 text-emerald-300" : "bg-[#ff3b24]/15 text-[#ffc0ad]"}`}>
          + Agregar
        </button>
      </div>
      {items.length === 0 ? (
        <p className="p-5 text-sm text-white/35">Todavía no cargaste {kind === "ingreso" ? "ingresos" : "gastos"} fijos.</p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {items.map((item) => {
            const pesos = itemInPesos(item, rates);
            const day = today ? effectiveDay(item.day_of_month, today.daysInMonth) : item.day_of_month;
            const done = today && day !== null && day <= today.day;
            return (
              <li key={item.id} className={`px-5 py-4 ${item.active ? "" : "opacity-45"}`}>
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => onEdit(item)} className="min-w-0 text-left">
                    <p className="truncate text-sm font-bold">{item.name}</p>
                    <p className="mt-0.5 text-[11px] text-white/40">
                      {item.scope === "negocio" ? "Negocio" : "Personal"} · {item.category}
                      {day !== null ? ` · día ${day}` : ""}
                      {item.active && day !== null ? (done ? (kind === "gasto" ? " · ya pagado" : " · ya entró") : " · pendiente") : ""}
                      {!item.active ? " · pausado" : ""}
                    </p>
                  </button>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black">{pesos ? money(pesos.total) : "—"}</p>
                    {item.currency === "USD" && <p className="text-[11px] text-white/40">{usd(item.amount)} · {DOLLAR_LABEL[item.dollar_type].replace("Dólar ", "")}</p>}
                    {pesos && pesos.iva > 0 && <p className="text-[11px] text-white/40">incluye IVA {money(pesos.iva)}</p>}
                  </div>
                </div>
                <div className="mt-2 flex gap-3 text-[10px] font-bold uppercase tracking-[0.1em]">
                  <button type="button" onClick={() => onEdit(item)} className="text-white/45 hover:text-white">Editar</button>
                  <button type="button" onClick={() => onToggle(item)} className="text-white/45 hover:text-white">{item.active ? "Pausar" : "Activar"}</button>
                  <button type="button" onClick={() => onRemove(item)} className="text-red-300/70 hover:text-red-300">Borrar</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
