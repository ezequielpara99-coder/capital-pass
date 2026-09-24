"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type TicketType = {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  status: string;
  active: boolean;
  salesStartAt: string | null;
  salesEndAt: string | null;
};

// El estado ("available"/"sold_out"/etc.) y la ventana de fecha
// (sales_start_at/sales_end_at) son independientes: una tanda puede
// seguir "available" pero tener una preventa programada para mas
// adelante, o ya haber pasado su fecha de cierre. Sin este chequeo la
// pagina mostraba la tanda como comprable y recien create_online_sale
// la rechazaba al final, despues de que el comprador ya cargo sus datos.
function withinSalesWindow(ticket: Pick<TicketType, "salesStartAt" | "salesEndAt">) {
  const now = Date.now();
  if (ticket.salesStartAt && new Date(ticket.salesStartAt).getTime() > now) return false;
  if (ticket.salesEndAt && new Date(ticket.salesEndAt).getTime() < now) return false;
  return true;
}

type Pack = {
  id: string;
  name: string;
  quantityPerPack: number;
  priceMinor: number;
  ticketTypeId: string;
  ticketTypeName: string;
  ticketTypeActive: boolean;
  ticketTypeStatus: string;
  salesStartAt: string | null;
  salesEndAt: string | null;
};

type Props = {
  slug: string;
  canBuyOnline: boolean;
  ticketTypes: TicketType[];
  packs: Pack[];
  feePercent: number;
};

// Clave de carrito: distingue una tanda suelta de un pack (viven en
// espacios de id separados, pero por las dudas no se pisan nunca).
const ticketKey = (id: string) => `ticket:${id}`;
const packKey = (id: string) => `pack:${id}`;

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTicketStatus(ticket: TicketType) {
  if (ticket.status === "sold_out") return "Agotada";
  if (ticket.status === "paused") return "Pausada";
  if (ticket.status === "upcoming") return "Próximamente";
  if (ticket.salesStartAt && new Date(ticket.salesStartAt).getTime() > Date.now()) return "Próximamente";
  if (ticket.salesEndAt && new Date(ticket.salesEndAt).getTime() < Date.now()) return "Finalizada";
  if (ticket.status === "available") return "Disponible";
  return ticket.status;
}

export default function EventCheckout({ slug, canBuyOnline, ticketTypes, packs, feePercent }: Props) {
  const searchParams = useSearchParams();
  const returningSaleId = searchParams.get("venta");

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [showForm, setShowForm] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dni, setDni] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Al confirmar, navegamos afuera con window.location.assign y nunca
  // volvemos a poner submitting en false (la pagina se va). Si el
  // comprador vuelve con el boton "atras" desde Mercado Pago y el
  // navegador restaura esta pagina desde bfcache en vez de recargarla,
  // el boton quedaria deshabilitado para siempre sin este reset.
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) setSubmitting(false);
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  const [error, setError] = useState("");

  const ticketCartItems = useMemo(
    () =>
      ticketTypes
        .map((ticket) => ({ ticket, quantity: quantities[ticketKey(ticket.id)] ?? 0 }))
        .filter((item) => item.quantity > 0),
    [ticketTypes, quantities]
  );

  const packCartItems = useMemo(
    () => packs.map((pack) => ({ pack, quantity: quantities[packKey(pack.id)] ?? 0 })).filter((item) => item.quantity > 0),
    [packs, quantities]
  );

  const subtotal =
    ticketCartItems.reduce((sum, item) => sum + item.ticket.priceMinor * item.quantity, 0) +
    packCartItems.reduce((sum, item) => sum + item.pack.priceMinor * item.quantity, 0);
  // Mismo redondeo que /api/e/[slug]/checkout: si esto no coincide, el
  // comprador ve un total distinto del que termina pagando en Mercado Pago.
  const feeAmount = Math.round(subtotal * (feePercent / 100));
  const total = subtotal + feeAmount;
  const hasItems = ticketCartItems.length > 0 || packCartItems.length > 0;

  function setQuantity(key: string, quantity: number) {
    setQuantities((previous) => ({ ...previous, [key]: Math.max(0, Math.min(20, quantity)) }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasItems) return;

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/e/${slug}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            ...ticketCartItems.map((item) => ({ ticketTypeId: item.ticket.id, quantity: item.quantity })),
            ...packCartItems.map((item) => ({ ticketTypeId: item.pack.ticketTypeId, packId: item.pack.id, quantity: item.quantity })),
          ],
          firstName,
          lastName,
          dni,
          phone,
          email: email || undefined,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "No pudimos iniciar la compra.");
      }

      window.location.assign(result.checkoutUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos iniciar la compra.");
      setSubmitting(false);
    }
  }

  if (returningSaleId) {
    return <ReturningSaleStatus slug={slug} saleId={returningSaleId} />;
  }

  return (
    <>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {ticketTypes.map((ticket) => {
          const available = ticket.status === "available" && ticket.active && withinSalesWindow(ticket);
          const quantity = quantities[ticketKey(ticket.id)] ?? 0;

          return (
            <article
              key={ticket.id}
              className="group relative overflow-hidden rounded-[26px] border border-[#ff5a2a]/[0.13] bg-gradient-to-br from-[#ff3b24]/[0.055] via-white/[0.025] to-[#ff5a2a]/[0.02] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,.035)] transition duration-200 hover:-translate-y-0.5 hover:border-[#ff5a2a]/[0.28] hover:shadow-[0_22px_70px_rgba(255,42,26,.09)]"
            >
              <div className="pointer-events-none absolute right-[-70px] top-[-90px] h-48 w-48 rounded-full bg-[#ff3b24]/[0.09] blur-[70px]" />

              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold">{ticket.name}</h3>
                    {ticket.description && (
                      <p className="mt-2 text-sm leading-6 text-white/35">{ticket.description}</p>
                    )}
                  </div>

                  <span
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                      available
                        ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200"
                        : ticket.status === "sold_out"
                          ? "border-red-400/20 bg-red-400/[0.07] text-red-200"
                          : "border-[#ff5a2a]/20 bg-[#ff5a2a]/[0.07] text-[#ff9b82]"
                    }`}
                  >
                    {formatTicketStatus(ticket)}
                  </span>
                </div>

                <p className="mt-7 text-3xl font-black tracking-tight">{formatMoney(ticket.priceMinor)}</p>

                {canBuyOnline && available && (
                  <div className="mt-5 flex h-12 w-fit items-center rounded-xl border border-white/10 bg-black/20">
                    <button
                      type="button"
                      onClick={() => setQuantity(ticketKey(ticket.id), quantity - 1)}
                      className="h-full w-11 text-lg text-white/70"
                      aria-label={`Restar ${ticket.name}`}
                    >
                      −
                    </button>
                    <div className="w-10 text-center text-base font-bold">{quantity}</div>
                    <button
                      type="button"
                      onClick={() => setQuantity(ticketKey(ticket.id), quantity + 1)}
                      className="h-full w-11 text-lg text-white/70"
                      aria-label={`Sumar ${ticket.name}`}
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {ticketTypes.length === 0 && packs.length === 0 && (
        <div className="mt-5 rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-7 text-sm text-white/35">
          No hay entradas disponibles para mostrar actualmente.
        </div>
      )}

      {packs.length > 0 && (
        <div className="mt-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ff6f4d]">Packs</p>
          <h3 className="mt-2 text-xl font-semibold">Varias entradas, un solo precio</h3>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {packs.map((pack) => {
              const quantity = quantities[packKey(pack.id)] ?? 0;
              const available =
                pack.ticketTypeActive &&
                pack.ticketTypeStatus === "available" &&
                withinSalesWindow(pack);

              return (
                <article
                  key={pack.id}
                  className="group relative overflow-hidden rounded-[26px] border border-emerald-400/[0.18] bg-gradient-to-br from-emerald-400/[0.06] via-white/[0.02] to-emerald-500/[0.02] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,.035)] transition duration-200 hover:-translate-y-0.5"
                >
                  <div className="relative">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold">{pack.name}</h3>
                        <p className="mt-2 text-sm leading-6 text-white/35">
                          {pack.quantityPerPack} entradas {pack.ticketTypeName ? `de ${pack.ticketTypeName}` : ""}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                          available
                            ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200"
                            : "border-[#ff5a2a]/20 bg-[#ff5a2a]/[0.07] text-[#ff9b82]"
                        }`}
                      >
                        {available ? "Disponible" : "No disponible"}
                      </span>
                    </div>

                    <p className="mt-7 text-3xl font-black tracking-tight">{formatMoney(pack.priceMinor)}</p>

                    {canBuyOnline && available && (
                      <div className="mt-5 flex h-12 w-fit items-center rounded-xl border border-white/10 bg-black/20">
                        <button
                          type="button"
                          onClick={() => setQuantity(packKey(pack.id), quantity - 1)}
                          className="h-full w-11 text-lg text-white/70"
                          aria-label={`Restar ${pack.name}`}
                        >
                          −
                        </button>
                        <div className="w-10 text-center text-base font-bold">{quantity}</div>
                        <button
                          type="button"
                          onClick={() => setQuantity(packKey(pack.id), quantity + 1)}
                          className="h-full w-11 text-lg text-white/70"
                          aria-label={`Sumar ${pack.name}`}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {canBuyOnline && hasItems && !showForm && (
        <div className="mt-6 flex flex-col gap-4 rounded-[24px] border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.06] p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {feeAmount > 0 && (
              <p className="text-xs text-white/35">
                Subtotal {formatMoney(subtotal)} + cargo por servicio {formatMoney(feeAmount)}
              </p>
            )}
            <p className="text-xs uppercase tracking-[0.15em] text-white/40">Total</p>
            <p className="mt-1 text-2xl font-black">{formatMoney(total)}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="h-14 rounded-2xl bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] px-7 text-sm font-black uppercase tracking-[0.1em] text-white shadow-[0_18px_50px_rgba(255,59,36,.25)] transition hover:brightness-110"
          >
            Continuar compra
          </button>
        </div>
      )}

      {canBuyOnline && showForm && (
        <form onSubmit={handleSubmit} className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.03] p-6 md:p-7">
          <p className="text-xs uppercase tracking-[0.15em] text-[#ff9b82]">Datos del comprador</p>
          <h3 className="mt-2 text-xl font-bold">Casi listo</h3>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" value={firstName} onChange={setFirstName} required />
            <Field label="Apellido" value={lastName} onChange={setLastName} required />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="DNI"
              value={dni}
              onChange={setDni}
              required
              inputMode="numeric"
              pattern="[0-9.]{6,12}"
              title="Ingresá tu DNI, solo números (podés usar puntos)"
            />
            <Field
              label="WhatsApp"
              value={phone}
              onChange={setPhone}
              required
              placeholder="Ej: 3462..."
              type="tel"
              inputMode="tel"
              pattern="[0-9 +\-]{8,20}"
              title="Ingresá tu WhatsApp, solo números (8 a 20 dígitos)"
            />
          </div>
          <div className="mt-4">
            <Field label="Email (opcional)" type="email" value={email} onChange={setEmail} />
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
            {feeAmount > 0 && (
              <div className="flex items-center justify-between text-xs text-white/40">
                <p>Subtotal</p>
                <p>{formatMoney(subtotal)}</p>
              </div>
            )}
            {feeAmount > 0 && (
              <div className="mt-1 flex items-center justify-between text-xs text-white/40">
                <p>Cargo por servicio</p>
                <p>{formatMoney(feeAmount)}</p>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between">
              <p className="text-sm text-white/50">Total a pagar</p>
              <p className="text-2xl font-black">{formatMoney(total)}</p>
            </div>
          </div>

          {error && (
            <div className="mt-5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !firstName.trim() || !lastName.trim() || !dni.trim() || !phone.trim()}
            className="mt-6 h-14 w-full rounded-2xl bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] text-base font-black disabled:cursor-not-allowed disabled:opacity-35"
          >
            {submitting ? "Redirigiendo a Mercado Pago..." : "Pagar con Mercado Pago"}
          </button>
        </form>
      )}
    </>
  );
}

type SaleStatus = "checking" | "pending_approval" | "confirmed" | "cancelled" | "refunded" | "unknown";

// Pantalla de vuelta de Mercado Pago. El webhook normalmente confirma la
// venta en segundos, pero si esa notificacion puntual se pierde o llega
// fuera de orden, antes no habia forma de que el comprador supiera si su
// pago se acredito o no -- se quedaba mirando un mensaje generico para
// siempre. Esto chequea el estado real una vez solo al entrar (dandole
// tiempo al webhook) y deja un boton para volver a intentar a mano.
function ReturningSaleStatus({ slug, saleId }: { slug: string; saleId: string }) {
  const [status, setStatus] = useState<SaleStatus>("checking");
  const [checking, setChecking] = useState(false);

  async function verify() {
    setChecking(true);
    try {
      const response = await fetch(`/api/e/${slug}/checkout/verificar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleId }),
      });
      const result = await response.json();
      setStatus(response.ok && result.status ? (result.status as SaleStatus) : "unknown");
    } catch {
      setStatus("unknown");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void verify(), 4000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId]);

  if (status === "confirmed") {
    return (
      <div className="mt-5 rounded-[24px] border border-emerald-400/20 bg-emerald-400/[0.05] p-7 text-sm leading-6 text-emerald-100">
        <p className="text-lg font-bold text-emerald-200">¡Pago confirmado!</p>
        <p className="mt-2 text-white/60">
          Tu entrada te va a llegar a tu WhatsApp o email en unos instantes. Número de referencia: <span className="font-mono text-white/80">{saleId}</span>.
        </p>
      </div>
    );
  }

  if (status === "cancelled" || status === "refunded") {
    return (
      <div className="mt-5 rounded-[24px] border border-white/15 bg-white/[0.03] p-7 text-sm leading-6 text-white/70">
        <p className="text-lg font-bold text-white/85">
          {status === "refunded" ? "Este pago fue reembolsado" : "No pudimos confirmar el pago"}
        </p>
        <p className="mt-2 text-white/50">
          Si te descontaron dinero y esto no coincide, escribile al organizador con el número de referencia: <span className="font-mono text-white/80">{saleId}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-[24px] border border-emerald-400/20 bg-emerald-400/[0.05] p-7 text-sm leading-6 text-emerald-100">
      <p className="text-lg font-bold text-emerald-200">¡Gracias por tu compra!</p>
      <p className="mt-2 text-white/60">
        Estamos confirmando tu pago con Mercado Pago — puede tardar unos segundos. Si el pago se aprobó, tu entrada te va a llegar a tu WhatsApp o email, y también podés revisar el estado escribiéndole al organizador con el número de referencia: <span className="font-mono text-white/80">{saleId}</span>.
      </p>
      <button
        type="button"
        onClick={() => void verify()}
        disabled={checking}
        className="mt-4 h-11 rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-5 text-sm font-bold text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {checking ? "Verificando..." : "Verificar mi pago"}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  type = "text",
  inputMode,
  pattern,
  title,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  pattern?: string;
  title?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-white/35">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        inputMode={inputMode}
        pattern={pattern}
        title={title}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm outline-none focus:border-[#ff5a2a]/50"
      />
    </label>
  );
}
