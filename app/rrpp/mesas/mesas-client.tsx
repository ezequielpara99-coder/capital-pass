"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import { friendlyErrorMessage } from "../../../lib/errors/friendly-message";

type Table = { id: string; name: string; capacity: number | null; price_minor: number | null; status: string };

function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

function normalizeWhatsAppNumber(value: string) {
  let digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("549")) return digits;
  if (digits.startsWith("54")) {
    const rest = digits.slice(2);
    return rest.startsWith("9") ? digits : `549${rest}`;
  }
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) return `549${digits}`;
  return digits;
}

export default function MesasClient({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selling, setSelling] = useState(false);

  const [tableId, setTableId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dni, setDni] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"efectivo" | "transferencia" | "">("");

  const [result, setResult] = useState<{ tableName: string; totalMinor: number; phone: string } | null>(null);

  // Se reusa en un reintento de la MISMA venta (ej. se corta la wifi justo
  // cuando el servidor ya la registro) y se renueva si cambia algo del
  // pedido -- mismo patron que ya usa /puerta y /bartender. No se
  // regenera mientras hay una venta EN VUELO (selling=true): el request
  // que ya salio quedo con la key vieja en el body, asi que renovarla acá
  // mientras se espera la respuesta haría que un reintento posterior
  // mandara una key que el servidor nunca vio, creando una reserva nueva
  // en vez de deduplicar.
  const saleAttemptKeyRef = useRef<string>(crypto.randomUUID());
  useEffect(() => {
    if (selling) return;
    saleAttemptKeyRef.current = crypto.randomUUID();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, firstName, lastName, dni, phone, paymentMethod]);

  async function load() {
    if (!eventId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/stock/tables?eventId=${eventId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudieron cargar las mesas.");
      setTables(data.tables ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err, "No se pudieron cargar las mesas."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const selectedTable = tables.find((t) => t.id === tableId) ?? null;

  async function confirmSale() {
    if (!tableId || !firstName.trim() || !lastName.trim() || !phone.trim() || !paymentMethod) return;
    if (normalizeWhatsAppNumber(phone).length < 12) {
      setError("Ese número de WhatsApp no parece válido. Revisalo antes de cobrar — es donde le vamos a mandar la confirmación.");
      return;
    }
    setSelling(true);
    setError("");
    try {
      const response = await fetch("/api/stock/tables/vender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          tableId,
          firstName,
          lastName,
          dni,
          phone,
          paymentMethod,
          idempotencyKey: saleAttemptKeyRef.current,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo vender la mesa.");
      setResult({ tableName: selectedTable?.name ?? "Mesa", totalMinor: Number(data.totalMinor ?? 0), phone });
    } catch (err) {
      setError(friendlyErrorMessage(err, "No se pudo vender la mesa."));
    } finally {
      setSelling(false);
    }
  }

  function sendWhatsApp() {
    if (!result) return;
    const number = normalizeWhatsAppNumber(result.phone);
    const message = `¡Hola! Tu mesa "${result.tableName}" para ${eventName} está reservada. Total: ${money(result.totalMinor)}. ¡Te esperamos!`;
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank");
  }

  function newSale() {
    setResult(null);
    setTableId("");
    setFirstName("");
    setLastName("");
    setDni("");
    setPhone("");
    setPaymentMethod("");
    load();
  }

  async function logout() {
    await createClient().auth.signOut();
    window.location.replace("/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07050a] text-white">
        <p className="text-sm text-white/40">Cargando mesas...</p>
      </main>
    );
  }

  if (!eventId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07050a] px-5 text-center text-white">
        <p className="text-sm text-white/40">Todavía no tenés un evento asignado.</p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07050a] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-200px] top-[-150px] h-[500px] w-[500px] rounded-full bg-[#ff2a1a]/[0.14] blur-[130px]" />
        <div className="absolute bottom-[-200px] right-[-150px] h-[500px] w-[500px] rounded-full bg-[#ff5a2a]/[0.10] blur-[130px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-lg px-5 py-7 sm:px-7 sm:py-10">
        <header className="mb-7 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href="/rrpp" className="text-xs font-medium text-white/40 transition hover:text-white">
              ← Volver
            </Link>
            <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[#ff9b82]">Capital Pass · RRPP</p>
            <h1 className="mt-2 text-2xl font-bold">Vender mesa</h1>
            <p className="mt-1 text-sm text-white/35">{eventName}</p>
          </div>
          <button type="button" onClick={logout} className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-white/55">
            Salir
          </button>
        </header>

        {error && <div className="mb-5 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {result ? (
          <div className="rounded-[28px] border border-emerald-400/20 bg-emerald-500/[0.06] p-7 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-2xl">✓</div>
            <p className="mt-4 text-lg font-bold">Mesa vendida</p>
            <p className="mt-1 text-sm text-white/50">{result.tableName} · {money(result.totalMinor)}</p>
            <button
              type="button"
              onClick={sendWhatsApp}
              className="mt-6 h-14 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-sm font-bold text-black"
            >
              📲 Avisar por WhatsApp
            </button>
            <button type="button" onClick={newSale} className="mt-3 h-14 w-full rounded-2xl border border-white/15 text-sm font-bold text-white/70">
              + Vender otra mesa
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <p className="mb-2 text-xs uppercase tracking-[0.15em] text-white/40">Mesa</p>
              <div className="grid grid-cols-2 gap-2">
                {tables.filter((t) => t.status === "available").map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTableId(t.id)}
                    className={`rounded-2xl border p-4 text-left ${tableId === t.id ? "border-[#ff5a2a]/60 bg-[#ff3b24]/10" : "border-white/10 bg-white/[0.03]"}`}
                  >
                    <p className="font-bold">{t.name}</p>
                    <p className="mt-1 text-xs text-white/40">{t.price_minor ? money(t.price_minor) : "Sin costo"}</p>
                  </button>
                ))}
              </div>
              {tables.filter((t) => t.status === "available").length === 0 && (
                <p className="text-sm text-white/30">No hay mesas disponibles para vender.</p>
              )}
            </section>

            {tableId && (
              <section className="space-y-3 rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                <div className="grid grid-cols-2 gap-3">
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Nombre" className="h-12 rounded-xl border border-white/15 bg-black/40 px-3 text-sm" />
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Apellido" className="h-12 rounded-xl border border-white/15 bg-black/40 px-3 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input value={dni} onChange={(e) => setDni(e.target.value)} placeholder="DNI (opcional)" className="h-12 rounded-xl border border-white/15 bg-black/40 px-3 text-sm" />
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp" className="h-12 rounded-xl border border-white/15 bg-black/40 px-3 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button" onClick={() => setPaymentMethod("efectivo")}
                    className={`h-12 rounded-xl border text-sm font-bold ${paymentMethod === "efectivo" ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-300" : "border-white/10"}`}
                  >
                    💵 Efectivo
                  </button>
                  <button
                    type="button" onClick={() => setPaymentMethod("transferencia")}
                    className={`h-12 rounded-xl border text-sm font-bold ${paymentMethod === "transferencia" ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-300" : "border-white/10"}`}
                  >
                    🏦 Transferencia
                  </button>
                </div>
                <button
                  type="button"
                  disabled={selling || !firstName.trim() || !lastName.trim() || !phone.trim() || !paymentMethod}
                  onClick={confirmSale}
                  className="h-14 w-full rounded-2xl bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] text-sm font-bold text-white disabled:opacity-40"
                >
                  {selling ? "Vendiendo..." : "Confirmar venta de mesa"}
                </button>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
