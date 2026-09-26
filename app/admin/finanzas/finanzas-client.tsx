"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "../../../lib/quotes/totals";

type Summary = {
  presupuestado: number;
  facturado: number;
  cobrado: number;
  pendiente: number;
  gastos: number;
  resultado: number;
};

type ByClient = { clientName: string; facturado: number; cobrado: number; pendiente: number; quotes: number };
type ByKind = { kind: "diseno" | "rental" | "otro"; facturado: number; cobrado: number; pendiente: number };

type Expense = {
  id: string;
  kind: "diseno" | "rental" | "general";
  category: string;
  description: string;
  amount_minor: number;
  expense_date: string;
  payment_method: string;
  is_recurring: boolean;
  notes: string | null;
};

const INPUT =
  "mt-2 h-12 w-full border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50";
const LABEL = "block text-[9px] font-black uppercase tracking-[0.18em] text-white/40";
const KIND_LABEL: Record<Expense["kind"], string> = { diseno: "Diseño", rental: "Rental", general: "General" };
const AREA_LABEL: Record<ByKind["kind"], string> = { diseno: "Capital Design", rental: "Capital Rentals", otro: "Otro" };
const METHOD_LABEL: Record<string, string> = {
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  mercadopago: "MercadoPago",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

function emptyDraft() {
  return {
    kind: "general" as Expense["kind"],
    category: "",
    description: "",
    amountMinor: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    paymentMethod: "transferencia",
    isRecurring: false,
    notes: "",
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(`${value}T12:00:00`));
}

export default function FinanzasClient() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byClient, setByClient] = useState<ByClient[]>([]);
  const [byKind, setByKind] = useState<ByKind[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missingSql, setMissingSql] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);

  const [goalMinor, setGoalMinor] = useState<number | null>(null);
  const [monthCobrado, setMonthCobrado] = useState(0);
  const [goalDraft, setGoalDraft] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);

  async function loadGoal() {
    try {
      const now = new Date();
      const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
      const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

      const [goalRes, summaryRes] = await Promise.all([
        fetch(`/api/admin/finanzas/metas?period=${period}`),
        fetch(`/api/admin/finanzas?from=${period}&to=${monthEnd}`),
      ]);
      const goalResult = await goalRes.json();
      const summaryResult = await summaryRes.json();
      if (goalRes.ok) setGoalMinor(goalResult.goal?.goalMinor ?? null);
      if (summaryRes.ok) setMonthCobrado(summaryResult.summary?.cobrado ?? 0);
    } catch {
      // silencioso -- la meta es informativa, no bloquea el resto del dashboard
    }
  }

  async function saveGoal() {
    if (savingGoal) return;
    const amount = Math.round(Number(goalDraft));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Ingresá un monto válido para la meta.");
      return;
    }
    setSavingGoal(true);
    setError("");
    try {
      const response = await fetch("/api/admin/finanzas/metas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalMinor: amount }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la meta.");
      setGoalMinor(result.goal.goalMinor);
      setEditingGoal(false);
      setGoalDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la meta.");
    } finally {
      setSavingGoal(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGoal();
  }, []);

  const expenseKeyRef = useRef<string>(crypto.randomUUID());
  useEffect(() => {
    if (saving) return;
    expenseKeyRef.current = crypto.randomUUID();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const rangeQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }, [from, to]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [summaryRes, expensesRes] = await Promise.all([
        fetch(`/api/admin/finanzas${rangeQuery ? `?${rangeQuery}` : ""}`),
        fetch(`/api/admin/finanzas/gastos${rangeQuery ? `?${rangeQuery}` : ""}`),
      ]);
      const summaryResult = await summaryRes.json();
      const expensesResult = await expensesRes.json();

      if (!summaryRes.ok || !expensesRes.ok) {
        if (summaryRes.status === 503 || expensesRes.status === 503) setMissingSql(true);
        throw new Error(summaryResult.error ?? expensesResult.error ?? "No se pudo cargar.");
      }

      setSummary(summaryResult.summary);
      setByClient(summaryResult.byClient ?? []);
      setByKind(summaryResult.byKind ?? []);
      setExpenses(expensesResult.expenses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeQuery]);

  async function addExpense(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/finanzas/gastos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, idempotencyKey: expenseKeyRef.current }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar el gasto.");
      setDraft(emptyDraft());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el gasto.");
    } finally {
      setSaving(false);
    }
  }

  async function removeExpense(expense: Expense) {
    if (!window.confirm(`¿Borrar el gasto "${expense.description}"?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/admin/finanzas/gastos?id=${expense.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo borrar.");
      setExpenses((prev) => prev.filter((row) => row.id !== expense.id));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    }
  }

  function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
    const escape = (value: string | number) => {
      const text = String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function exportExpensesCsv() {
    downloadCsv(
      `gastos${from ? `_${from}` : ""}${to ? `_${to}` : ""}.csv`,
      ["Fecha", "Área", "Categoría", "Descripción", "Monto", "Método", "Recurrente", "Notas"],
      expenses.map((e) => [e.expense_date, KIND_LABEL[e.kind], e.category, e.description, e.amount_minor, METHOD_LABEL[e.payment_method] ?? e.payment_method, e.is_recurring ? "Sí" : "No", e.notes ?? ""])
    );
  }

  function exportClientsCsv() {
    downloadCsv(
      "rentabilidad_por_cliente.csv",
      ["Cliente", "Presupuestos facturados", "Facturado", "Cobrado", "Pendiente"],
      byClient.map((row) => [row.clientName, row.quotes, row.facturado, row.cobrado, row.pendiente])
    );
  }

  const cards: { label: string; value: number; hint: string; tone: string }[] = summary
    ? [
        { label: "Presupuestado", value: summary.presupuestado, hint: "Presupuestos activos (no rechazados)", tone: "text-white" },
        { label: "Facturado", value: summary.facturado, hint: "Confirmados: a pagar + aceptados", tone: "text-sky-300" },
        { label: "Cobrado", value: summary.cobrado, hint: "Pagos ya registrados", tone: "text-emerald-300" },
        { label: "Pendiente", value: summary.pendiente, hint: "Facturado que falta cobrar", tone: "text-amber-300" },
        { label: "Gastos", value: summary.gastos, hint: "Gastos registrados en el rango", tone: "text-red-300" },
        { label: "Resultado neto", value: summary.resultado, hint: "Cobrado menos gastos", tone: summary.resultado >= 0 ? "text-emerald-300" : "text-red-300" },
      ]
    : [];

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[1100px] px-5 py-8 md:px-8">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href="/admin" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Admin
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass admin</p>
          <h1 className="mt-3 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Finanzas.</h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">
            Presupuestado, facturado, cobrado, pendiente, gastos y resultado neto. Los pagos se registran desde cada{" "}
            <Link href="/admin/presupuestos" className="underline decoration-white/30 hover:text-white">presupuesto</Link>.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/admin/finanzas/cobros"
              className="inline-flex h-10 items-center border border-amber-400/30 bg-amber-400/10 px-4 text-[9px] font-black uppercase tracking-[0.15em] text-amber-300 transition hover:bg-amber-400/20"
            >
              Ver centro de cobros →
            </Link>
            <Link
              href="/admin/finanzas/cierres"
              className="inline-flex h-10 items-center border border-white/[0.14] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/60 transition hover:border-white/40 hover:text-white"
            >
              Cierre mensual →
            </Link>
          </div>
        </header>

        {missingSql && (
          <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Falta aplicar la actualización de la base de datos de finanzas (20260966).
          </div>
        )}
        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <section className="mt-6 border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Meta del mes</p>
            {!editingGoal && (
              <button type="button" onClick={() => { setEditingGoal(true); setGoalDraft(goalMinor ? String(goalMinor) : ""); }} className="h-8 border border-white/15 px-3 text-[9px] font-black uppercase tracking-wide text-white/60 hover:border-white/40 hover:text-white">
                {goalMinor ? "Editar" : "+ Definir meta"}
              </button>
            )}
          </div>

          {editingGoal ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="block">
                <span className={LABEL}>Meta de cobrado ($)</span>
                <input value={goalDraft} onChange={(e) => setGoalDraft(e.target.value)} inputMode="numeric" className="mt-2 h-11 w-40 border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50" placeholder="1000000" />
              </label>
              <button type="button" disabled={savingGoal} onClick={saveGoal} className="h-11 border border-emerald-400/30 bg-emerald-400/10 px-4 text-[10px] font-black uppercase tracking-wide text-emerald-300 hover:bg-emerald-400/20 disabled:opacity-40">
                {savingGoal ? "Guardando…" : "Guardar"}
              </button>
              <button type="button" onClick={() => setEditingGoal(false)} className="h-11 border border-white/[0.14] px-4 text-[10px] font-black uppercase tracking-wide text-white/60 hover:text-white">
                Cancelar
              </button>
            </div>
          ) : goalMinor ? (
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-black text-emerald-300">{formatMoney(monthCobrado)}</span>
                <span className="text-white/35">de {formatMoney(goalMinor)}</span>
              </div>
              <div className="mt-2 h-2 w-full bg-white/[0.06]">
                <div className="h-2 bg-emerald-400" style={{ width: `${Math.min(100, (monthCobrado / goalMinor) * 100)}%` }} />
              </div>
              <p className="mt-2 text-[11px] text-white/30">{Math.round((monthCobrado / goalMinor) * 100)}% de la meta de este mes</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-white/35">Todavía no definiste una meta de cobrado para este mes.</p>
          )}
        </section>

        <div className="mt-6 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className={LABEL}>Desde</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-2 h-11 border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50" />
          </label>
          <label className="block">
            <span className={LABEL}>Hasta</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-2 h-11 border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50" />
          </label>
          {(from || to) && (
            <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="h-11 border border-white/[0.14] px-4 text-[10px] font-black uppercase tracking-[0.14em] text-white/60 hover:text-white">
              Limpiar
            </button>
          )}
        </div>

        <div className="mt-6 grid gap-[1px] bg-white/[0.08] sm:grid-cols-2 xl:grid-cols-3">
          {loading && !summary
            ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse bg-[#080706]/85" />)
            : cards.map((card) => (
                <div key={card.label} className="bg-[#080706]/85 p-5">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">{card.label}</p>
                  <p className={`mt-2 text-2xl font-black tracking-[-0.02em] ${card.tone}`}>{formatMoney(card.value)}</p>
                  <p className="mt-1 text-[11px] text-white/30">{card.hint}</p>
                </div>
              ))}
        </div>

        {byKind.length > 0 && (
          <section className="mt-10">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Por área</p>
            <div className="mt-3 grid gap-[1px] bg-white/[0.08] sm:grid-cols-2">
              {byKind.map((row) => (
                <div key={row.kind} className="bg-[#080706]/85 p-4">
                  <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${row.kind === "diseno" ? "text-violet-300" : "text-[#ff7354]"}`}>{AREA_LABEL[row.kind]}</p>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                    <span className="text-white/50">Facturado <b className="text-white">{formatMoney(row.facturado)}</b></span>
                    <span className="text-white/50">Cobrado <b className="text-emerald-300">{formatMoney(row.cobrado)}</b></span>
                    <span className="text-white/50">Pendiente <b className="text-amber-300">{formatMoney(row.pendiente)}</b></span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {byClient.length > 0 && (
          <section className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Rentabilidad por cliente</p>
              <button type="button" onClick={exportClientsCsv} className="h-8 border border-white/[0.14] px-3 text-[9px] font-black uppercase tracking-[0.12em] text-white/60 hover:border-white/40 hover:text-white">
                ⬇ Exportar CSV
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {byClient.map((row) => (
                <div key={row.clientName} className="flex items-center gap-3 border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{row.clientName}</p>
                    <p className="text-[11px] text-white/35">{row.quotes} {row.quotes === 1 ? "presupuesto facturado" : "presupuestos facturados"}</p>
                  </div>
                  <div className="flex shrink-0 gap-x-4 text-right text-xs">
                    <span className="text-white/50">Fact. <b className="text-white">{formatMoney(row.facturado)}</b></span>
                    <span className="text-white/50">Cobr. <b className="text-emerald-300">{formatMoney(row.cobrado)}</b></span>
                    <span className="text-white/50">Pend. <b className="text-amber-300">{formatMoney(row.pendiente)}</b></span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-10 border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Nuevo gasto</p>

          <form onSubmit={addExpense}>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <label className="mt-3 block">
                <span className={LABEL}>Descripción *</span>
                <input value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} className={INPUT} placeholder="Alquiler de local" />
              </label>
              <label className="mt-3 block">
                <span className={LABEL}>Monto *</span>
                <input value={draft.amountMinor} onChange={(e) => setDraft((d) => ({ ...d, amountMinor: e.target.value }))} inputMode="numeric" className={INPUT} placeholder="0" />
              </label>
            </div>

            <div className="grid gap-x-4 sm:grid-cols-3">
              <label className="mt-3 block">
                <span className={LABEL}>Área</span>
                <select value={draft.kind} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as Expense["kind"] }))} className={INPUT}>
                  <option value="general">General</option>
                  <option value="diseno">Diseño</option>
                  <option value="rental">Rental</option>
                </select>
              </label>
              <label className="mt-3 block">
                <span className={LABEL}>Categoría</span>
                <input value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} className={INPUT} placeholder="Alquiler, sueldos, insumos…" />
              </label>
              <label className="mt-3 block">
                <span className={LABEL}>Fecha</span>
                <input type="date" value={draft.expenseDate} onChange={(e) => setDraft((d) => ({ ...d, expenseDate: e.target.value }))} className={INPUT} />
              </label>
            </div>

            <div className="grid gap-x-4 sm:grid-cols-2">
              <label className="mt-3 block">
                <span className={LABEL}>Método de pago</span>
                <select value={draft.paymentMethod} onChange={(e) => setDraft((d) => ({ ...d, paymentMethod: e.target.value }))} className={INPUT}>
                  {Object.entries(METHOD_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="mt-3 flex items-end gap-2 pb-3">
                <input type="checkbox" checked={draft.isRecurring} onChange={(e) => setDraft((d) => ({ ...d, isRecurring: e.target.checked }))} className="h-4 w-4" />
                <span className="text-xs text-white/60">Es un gasto recurrente (mensual)</span>
              </label>
            </div>

            <label className="mt-3 block">
              <span className={LABEL}>Notas</span>
              <input value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} className={INPUT} />
            </label>

            <button type="submit" disabled={saving} className="mt-4 h-12 w-full bg-[#ff2a1a] text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d] disabled:opacity-40 sm:w-auto sm:px-8">
              {saving ? "Guardando…" : "+ Registrar gasto"}
            </button>
          </form>
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Gastos registrados</p>
            {expenses.length > 0 && (
              <button type="button" onClick={exportExpensesCsv} className="h-8 border border-white/[0.14] px-3 text-[9px] font-black uppercase tracking-[0.12em] text-white/60 hover:border-white/40 hover:text-white">
                ⬇ Exportar CSV
              </button>
            )}
          </div>

          {expenses.length === 0 ? (
            <div className="mt-4 border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">
              {loading ? "Cargando…" : "Todavía no hay gastos registrados en este rango."}
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {expenses.map((expense) => (
                <div key={expense.id} className="flex items-center gap-3 border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{expense.description}</p>
                    <p className="truncate text-[11px] text-white/35">
                      {formatDate(expense.expense_date)} · {KIND_LABEL[expense.kind]} · {expense.category} · {METHOD_LABEL[expense.payment_method] ?? expense.payment_method}
                      {expense.is_recurring ? " · Recurrente" : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-black text-red-300">{formatMoney(expense.amount_minor)}</p>
                  <button type="button" onClick={() => removeExpense(expense)} className="h-9 shrink-0 border border-red-400/20 px-3 text-[10px] font-black uppercase tracking-wide text-red-300/70 hover:text-red-300">
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
