"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

export type TicketTypeRow = {
  id: string;
  name: string;
  description: string | null;
  price_minor: number;
  currency: string;
  capacity: number;
  status: string;
  active: boolean;
};

export type PackRow = {
  id: string;
  name: string;
  ticket_type_id: string;
  quantity_per_pack: number;
  price_minor: number;
  active: boolean;
};

type SaleResult = {
  sale_id: string;
  buyer_id: string;
  total_minor: number | string;
  tickets_created: number;
};

type GeneratedEntry = {
  id: string;
  displayNumber: number | string;
  manualCode: string;
  status: string;
  ticketType: string;
  url: string;
};

type EntriesResponse = {
  saleId: string;
  event: { id: string; name: string };
  buyer: {
    firstName: string;
    lastName: string;
    dni: string | null;
    phone: string | null;
  };
  entries: GeneratedEntry[];
};

function money(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTicketNumber(value: number | string) {
  return String(value).padStart(7, "0");
}

// Convierte números argentinos cargados de forma local (ej. 03468529047)
// al formato que espera wa.me (5493468529047).
function normalizeWhatsAppNumber(value: string | null) {
  if (!value) return "";
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

export default function VenderClient({
  event,
  ticketTypes,
  packs,
}: {
  event: { id: string; name: string };
  ticketTypes: TicketTypeRow[];
  packs: PackRow[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [saving, setSaving] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [ticketTypeId, setTicketTypeId] = useState(ticketTypes[0]?.id ?? "");
  const [packId, setPackId] = useState("");
  const [quantity, setQuantity] = useState(1);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dni, setDni] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"efectivo" | "transferencia" | "">("");

  const [error, setError] = useState("");
  const [entryError, setEntryError] = useState("");
  const [saleResult, setSaleResult] = useState<SaleResult | null>(null);
  const [entriesResult, setEntriesResult] = useState<EntriesResponse | null>(null);

  const selectedTicketType = ticketTypes.find((item) => item.id === ticketTypeId) ?? null;
  const selectedPack = packs.find((p) => p.id === packId) ?? null;

  const unitPrice = selectedPack
    ? selectedPack.price_minor
    : selectedTicketType
    ? Number(selectedTicketType.price_minor ?? 0)
    : 0;

  const total = unitPrice * quantity;
  const ticketsToGenerate = selectedPack ? selectedPack.quantity_per_pack * quantity : quantity;

  // Se reusa en un reintento de la MISMA venta (ej. se corta la wifi justo
  // cuando el servidor ya la registró) y se renueva si cambia algo del
  // pedido -- mientras hay una venta EN VUELO (saving=true) no se
  // regenera: el request que ya salió quedó con la key vieja en el body,
  // así que renovarla acá mientras se espera la respuesta haría que un
  // reintento posterior mandara una key que el servidor nunca vio,
  // creando una venta nueva completa en vez de deduplicar. Mismo patrón
  // ya usado (y con este mismo bug ya encontrado y corregido) en
  // app/puerta/page.tsx y app/rrpp/nueva-venta/page.tsx.
  const saleAttemptKeyRef = useRef<string>(crypto.randomUUID());
  useEffect(() => {
    if (saving) return;
    saleAttemptKeyRef.current = crypto.randomUUID();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketTypeId, packId, quantity, paymentMethod, firstName, lastName, dni, phone, email]);

  function changeQuantity(amount: number) {
    setQuantity((current) => Math.min(20, Math.max(1, current + amount)));
  }

  async function loadGeneratedEntries(saleId: string, waWindow: Window | null) {
    setLoadingEntries(true);
    setEntryError("");
    try {
      const response = await fetch(`/api/ventas/${saleId}/entradas`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudieron cargar las entradas.");

      setEntriesResult(result as EntriesResponse);

      sendAllWhatsApp(result as EntriesResponse, waWindow);

      // Best-effort: si el comprador cargó email, le llega la entrada
      // (QR adjunto) ahí también, además del WhatsApp.
      fetch(`/api/ventas/${saleId}/enviar-email`, { method: "POST" }).catch(() => {});
    } catch (err) {
      console.error("ERROR CARGANDO ENTRADAS:", err);
      waWindow?.close();
      setEntryError(err instanceof Error ? err.message : "No se pudieron cargar las entradas.");
    } finally {
      setLoadingEntries(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError("");
    setEntryError("");

    if (!firstName.trim()) return setError("Ingresá el nombre del comprador.");
    if (!lastName.trim()) return setError("Ingresá el apellido del comprador.");
    if (!dni.trim()) return setError("Ingresá el DNI del comprador.");
    if (!phone.trim()) return setError("Ingresá el teléfono o WhatsApp del comprador.");
    if (normalizeWhatsAppNumber(phone).length < 12) {
      return setError("Ese número de WhatsApp no parece válido.");
    }
    if (!paymentMethod) return setError("Elegí el método de pago.");
    if (!selectedPack && !ticketTypeId) return setError("Elegí una entrada.");

    setSaving(true);

    // Abrimos la pestaña de WhatsApp YA, todavía dentro del gesto de click
    // del submit -- si esperamos a que terminen los pedidos a la base, el
    // navegador ya perdió el "user activation" transitorio y bloquea el
    // popup como si fuera spam.
    const waWindow = window.open("", "_blank");

    try {
      const { data, error: saleError } = await supabase.rpc("create_sale", {
        p_event_id: event.id,
        p_ticket_type_id: selectedPack ? selectedPack.ticket_type_id : ticketTypeId,
        p_quantity: quantity,
        p_buyer_first_name: firstName.trim(),
        p_buyer_last_name: lastName.trim(),
        p_buyer_dni: dni.trim(),
        p_buyer_phone: phone.trim(),
        p_buyer_email: email.trim() || null,
        p_payment_method: paymentMethod,
        p_pack_id: selectedPack ? selectedPack.id : null,
        p_idempotency_key: saleAttemptKeyRef.current,
      });

      if (saleError) throw saleError;

      const result = (data ?? [])[0] as SaleResult | undefined;
      if (!result) throw new Error("La venta no devolvió un resultado válido.");

      // Desde este momento la venta YA EXISTE -- por eso mostramos
      // pantalla de éxito incluso si luego falla la carga visual de las
      // entradas.
      setSaleResult(result);

      await loadGeneratedEntries(result.sale_id, waWindow);
    } catch (err) {
      console.error("ERROR CREANDO VENTA:", err);
      waWindow?.close();
      setError(err instanceof Error ? err.message : "No se pudo registrar la venta.");
    } finally {
      setSaving(false);
    }
  }

  function sendAllWhatsApp(result: EntriesResponse, waWindow: Window | null) {
    const number = normalizeWhatsAppNumber(result.buyer.phone);
    if (!number) {
      waWindow?.close();
      setEntryError(
        "La venta se registró, pero el teléfono cargado no es válido y no pudimos abrir WhatsApp. Contactá al comprador por otro medio para pasarle sus entradas."
      );
      return;
    }

    const lines = [
      `🎟️ *Tus entradas para ${result.event.name}*`,
      "",
      `Hola ${result.buyer.firstName} 👋`,
      "",
    ];
    for (const entry of result.entries) {
      lines.push(
        `Entrada: ${entry.ticketType} · N.º #${formatTicketNumber(entry.displayNumber)}`,
        `Código: ${entry.manualCode}`,
        `${window.location.origin}${entry.url}`,
        ""
      );
    }
    lines.push("Presentá cada entrada al ingresar.", "", "Capital Pass");

    const whatsappUrl = `https://wa.me/${number}?text=${encodeURIComponent(lines.join("\n"))}`;
    if (waWindow) {
      waWindow.location.href = whatsappUrl;
    } else {
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    }
  }

  function newSale() {
    setFirstName("");
    setLastName("");
    setDni("");
    setPhone("");
    setEmail("");
    setPaymentMethod("");
    setQuantity(1);
    setPackId("");
    setSaleResult(null);
    setEntriesResult(null);
    setError("");
    setEntryError("");
  }

  // =====================================================
  // RESULTADO
  // =====================================================

  if (saleResult) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#07050a] text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[-180px] top-[-160px] h-[500px] w-[500px] rounded-full bg-[#ff2a1a]/25 blur-[130px]" />
          <div className="absolute bottom-[-180px] right-[-130px] h-[500px] w-[500px] rounded-full bg-[#ff5a2a]/20 blur-[130px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-2xl px-5 py-7 sm:px-7 sm:py-10">
          <div className="mb-6 rounded-[26px] border border-emerald-400/25 bg-emerald-500/[0.07] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Venta confirmada</p>
            <h1 className="mt-2 text-2xl font-bold">
              {saleResult.tickets_created} entrada{saleResult.tickets_created === 1 ? "" : "s"} generada
              {saleResult.tickets_created === 1 ? "" : "s"}
            </h1>
            <p className="mt-2 text-sm text-white/40">Total: {money(Number(saleResult.total_minor))}</p>
          </div>

          {entryError && (
            <div className="mb-5 rounded-[24px] border border-orange-400/25 bg-orange-500/10 p-5">
              <p className="font-semibold text-orange-200">La venta fue registrada correctamente.</p>
              <p className="mt-2 text-sm leading-6 text-white/45">
                Pero no pudimos cargar las entradas en pantalla. No vuelvas a confirmar la venta.
              </p>
              <p className="mt-2 text-xs text-orange-200/70">{entryError}</p>
              <button
                type="button"
                disabled={loadingEntries}
                onClick={() => loadGeneratedEntries(saleResult.sale_id, window.open("", "_blank"))}
                className="mt-4 rounded-xl border border-orange-300/25 bg-orange-500/10 px-4 py-2.5 text-sm font-semibold text-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingEntries ? "Cargando..." : "Reintentar cargar entradas"}
              </button>
            </div>
          )}

          {entriesResult && (
            <section className="space-y-4">
              <div className="mb-2">
                <h2 className="text-lg font-semibold">Entradas de la venta</h2>
                <p className="mt-1 text-sm text-white/35">Cada entrada tiene su propio QR y código.</p>
              </div>

              {entriesResult.entries.map((entry, index) => (
                <article
                  key={entry.id}
                  className="overflow-hidden rounded-[26px] border border-[#ff5a2a]/20 bg-white/[0.04] backdrop-blur-xl"
                >
                  <div className="border-b border-white/[0.08] bg-gradient-to-r from-[#ff3b24]/[0.08] to-[#ff5a2a]/[0.08] px-5 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ff9b82]">
                          Entrada {index + 1}
                        </p>
                        <p className="mt-1 font-bold">{entry.ticketType}</p>
                      </div>
                      <p className="font-mono text-sm font-semibold text-white/55">
                        #{formatTicketNumber(entry.displayNumber)}
                      </p>
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Código de validación</p>
                      <p className="mt-2 font-mono text-lg font-bold tracking-[0.12em]">{entry.manualCode}</p>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-13 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm font-semibold text-white/70 transition hover:text-white"
                      >
                        Ver entrada
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          const number = normalizeWhatsAppNumber(entriesResult.buyer.phone);
                          if (!number) {
                            alert("El comprador no tiene un teléfono válido.");
                            return;
                          }
                          const message = [
                            `🎟️ *Tu entrada para ${entriesResult.event.name}*`,
                            "",
                            `Hola ${entriesResult.buyer.firstName} 👋`,
                            "",
                            `Entrada: ${entry.ticketType}`,
                            `N.º #${formatTicketNumber(entry.displayNumber)}`,
                            `Código de validación: ${entry.manualCode}`,
                            "",
                            "Podés ver tu entrada digital y QR acá:",
                            `${window.location.origin}${entry.url}`,
                            "",
                            "Presentá esta entrada al ingresar.",
                          ].join("\n");
                          window.open(
                            `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
                            "_blank",
                            "noopener,noreferrer"
                          );
                        }}
                        className="h-13 rounded-2xl bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] px-4 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(255,90,42,0.18)] transition hover:scale-[1.01]"
                      >
                        📲 Enviar por WhatsApp
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )}

          <div className="mt-7 space-y-3">
            <button
              type="button"
              onClick={newSale}
              className="h-14 w-full rounded-2xl border border-[#ff5a2a]/25 bg-[#ff3b24]/10 text-sm font-bold text-[#ffe4d9] transition hover:bg-[#ff3b24]/20"
            >
              + Registrar otra venta
            </button>
            <button
              type="button"
              onClick={() => router.push("/panel")}
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.03] text-sm font-medium text-white/50 transition hover:text-white"
            >
              Volver a mi panel
            </button>
          </div>
        </div>
      </main>
    );
  }

  // =====================================================
  // FORMULARIO
  // =====================================================

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07050a] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-180px] top-[-160px] h-[500px] w-[500px] rounded-full bg-[#ff2a1a]/25 blur-[130px]" />
        <div className="absolute bottom-[-180px] right-[-130px] h-[500px] w-[500px] rounded-full bg-[#ff5a2a]/20 blur-[130px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-5 py-7 sm:px-7 sm:py-10">
        <header className="mb-7 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/panel")}
            className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm text-white/55 transition hover:text-white"
          >
            ← Volver
          </button>
          <div className="text-right">
            <p className="text-sm font-semibold">Capital Pass</p>
            <p className="text-xs text-white/30">Venta del organizador</p>
          </div>
        </header>

        <div className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff9b82]">{event.name}</p>
          <h1 className="mt-2 text-3xl font-bold">Nueva venta</h1>
          <p className="mt-2 text-sm text-white/40">Completá los datos del comprador y confirmá la venta.</p>
        </div>

        {ticketTypes.length === 0 ? (
          <div className="rounded-[26px] border border-orange-400/20 bg-orange-500/[0.07] p-6">
            <h2 className="font-semibold text-orange-200">No hay entradas disponibles</h2>
            <p className="mt-2 text-sm leading-6 text-white/40">
              En este momento no hay ninguna tanda habilitada para vender.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.035] p-6 backdrop-blur-xl">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-white/35">Comprador</p>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Nombre">
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Ej: Juan"
                    className={inputClass}
                  />
                </Field>
                <Field label="Apellido">
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Ej: Pérez"
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Field label="DNI">
                  <input
                    value={dni}
                    onChange={(e) => setDni(e.target.value)}
                    inputMode="numeric"
                    placeholder="Ej: 40123456"
                    className={inputClass}
                  />
                </Field>
                <Field label="WhatsApp">
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    placeholder="Ej: 3416000000"
                    className={inputClass}
                  />
                  <p className="mt-2 text-xs leading-5 text-white/25">Usaremos este número para enviar la entrada.</p>
                </Field>
                <Field label="Email (opcional)">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Para mandarle la entrada también por mail"
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="mt-5">
                <p className="mb-2 text-sm text-white/70">Método de pago</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("efectivo")}
                    className={`h-12 rounded-xl border text-sm font-semibold transition ${
                      paymentMethod === "efectivo"
                        ? "border-[#ff5a2a]/50 bg-[#ff3b24]/15 text-white"
                        : "border-white/10 bg-black/20 text-white/50 hover:text-white"
                    }`}
                  >
                    💵 Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("transferencia")}
                    className={`h-12 rounded-xl border text-sm font-semibold transition ${
                      paymentMethod === "transferencia"
                        ? "border-[#ff5a2a]/50 bg-[#ff3b24]/15 text-white"
                        : "border-white/10 bg-black/20 text-white/50 hover:text-white"
                    }`}
                  >
                    🏦 Transferencia
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-[#ff5a2a]/15 bg-white/[0.035] p-6 backdrop-blur-xl">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-[#ff9b82]">Entrada</p>

              <Field label="Tipo de entrada">
                <select
                  value={packId ? `pack:${packId}` : ticketTypeId}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.startsWith("pack:")) {
                      setPackId(value.slice(5));
                    } else {
                      setPackId("");
                      setTicketTypeId(value);
                    }
                    setQuantity(1);
                  }}
                  className={inputClass}
                >
                  {ticketTypes.map((item) => (
                    <option key={item.id} value={item.id} className="bg-[#100817]">
                      {item.name} · {money(Number(item.price_minor))}
                    </option>
                  ))}
                  {packs.map((pack) => (
                    <option key={pack.id} value={`pack:${pack.id}`} className="bg-[#100817]">
                      📦 {pack.name} · {money(pack.price_minor)}
                    </option>
                  ))}
                </select>
              </Field>

              {selectedPack && (
                <p className="mt-2 text-xs text-[#ff9b82]">
                  Cada pack genera {selectedPack.quantity_per_pack} entradas de{" "}
                  {ticketTypes.find((t) => t.id === selectedPack.ticket_type_id)?.name ?? "la tanda"}.
                </p>
              )}
              {selectedTicketType?.description && !selectedPack && (
                <p className="mt-2 text-xs text-white/30">{selectedTicketType.description}</p>
              )}

              <div className="mt-6">
                <p className="mb-2 text-sm text-white/70">Cantidad</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => changeQuantity(-1)}
                    className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-xl transition hover:bg-white/[0.06]"
                  >
                    −
                  </button>
                  <div className="flex h-12 min-w-[80px] items-center justify-center rounded-xl border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.08] text-xl font-bold">
                    {quantity}
                  </div>
                  <button
                    type="button"
                    onClick={() => changeQuantity(1)}
                    className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-xl transition hover:bg-white/[0.06]"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-white/30">
                    {selectedPack ? "Entradas a generar" : "Precio"}
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    {selectedPack ? ticketsToGenerate : money(unitPrice)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.08] p-4">
                  <p className="text-[10px] uppercase tracking-wider text-[#ff9b82]">Total</p>
                  <p className="mt-2 text-xl font-bold">{money(total)}</p>
                </div>
              </div>
            </section>

            {error && (
              <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="h-16 w-full rounded-2xl bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] text-base font-bold text-white shadow-[0_15px_45px_rgba(255,42,26,0.25)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Confirmando venta..." : `Confirmar venta · ${money(total)}`}
            </button>

            <p className="px-3 text-center text-xs leading-5 text-white/25">
              Al confirmar, Capital Pass registrará la venta y generará las entradas correspondientes.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

const inputClass =
  "h-14 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/60 focus:ring-2 focus:ring-[#ff3b24]/10";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-white/70">{label}</span>
      {children}
    </label>
  );
}
