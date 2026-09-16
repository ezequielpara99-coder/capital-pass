"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type TicketType = {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  status: string;
  active: boolean;
};

type Props = {
  slug: string;
  canBuyOnline: boolean;
  ticketTypes: TicketType[];
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTicketStatus(status: string) {
  if (status === "available") return "Disponible";
  if (status === "sold_out") return "Agotada";
  if (status === "upcoming") return "Próximamente";
  if (status === "paused") return "Pausada";
  return status;
}

export default function EventCheckout({ slug, canBuyOnline, ticketTypes }: Props) {
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
  const [error, setError] = useState("");

  const cartItems = useMemo(
    () =>
      ticketTypes
        .map((ticket) => ({ ticket, quantity: quantities[ticket.id] ?? 0 }))
        .filter((item) => item.quantity > 0),
    [ticketTypes, quantities]
  );

  const total = cartItems.reduce((sum, item) => sum + item.ticket.priceMinor * item.quantity, 0);
  const hasItems = cartItems.length > 0;

  function setQuantity(ticketId: string, quantity: number) {
    setQuantities((previous) => ({ ...previous, [ticketId]: Math.max(0, Math.min(20, quantity)) }));
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
          items: cartItems.map((item) => ({ ticketTypeId: item.ticket.id, quantity: item.quantity })),
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
    return (
      <div className="mt-5 rounded-[24px] border border-emerald-400/20 bg-emerald-400/[0.05] p-7 text-sm leading-6 text-emerald-100">
        <p className="text-lg font-bold text-emerald-200">¡Gracias por tu compra!</p>
        <p className="mt-2 text-white/60">
          Estamos confirmando tu pago con Mercado Pago — puede tardar unos segundos. Si el pago se aprobó, tu entrada te va a llegar a tu WhatsApp o email, y también podés revisar el estado escribiéndole al organizador con el número de referencia: <span className="font-mono text-white/80">{returningSaleId}</span>.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {ticketTypes.map((ticket) => {
          const available = ticket.status === "available" && ticket.active;
          const quantity = quantities[ticket.id] ?? 0;

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
                    {formatTicketStatus(ticket.status)}
                  </span>
                </div>

                <p className="mt-7 text-3xl font-black tracking-tight">{formatMoney(ticket.priceMinor)}</p>

                {canBuyOnline && available && (
                  <div className="mt-5 flex h-12 w-fit items-center rounded-xl border border-white/10 bg-black/20">
                    <button
                      type="button"
                      onClick={() => setQuantity(ticket.id, quantity - 1)}
                      className="h-full w-11 text-lg text-white/70"
                      aria-label={`Restar ${ticket.name}`}
                    >
                      −
                    </button>
                    <div className="w-10 text-center text-base font-bold">{quantity}</div>
                    <button
                      type="button"
                      onClick={() => setQuantity(ticket.id, quantity + 1)}
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

      {ticketTypes.length === 0 && (
        <div className="mt-5 rounded-[24px] border border-white/[0.08] bg-white/[0.025] p-7 text-sm text-white/35">
          No hay entradas disponibles para mostrar actualmente.
        </div>
      )}

      {canBuyOnline && hasItems && !showForm && (
        <div className="mt-6 flex flex-col gap-4 rounded-[24px] border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.06] p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
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
            <Field label="DNI" value={dni} onChange={setDni} required />
            <Field label="WhatsApp" value={phone} onChange={setPhone} required placeholder="Ej: 3462..." />
          </div>
          <div className="mt-4">
            <Field label="Email (opcional)" type="email" value={email} onChange={setEmail} />
          </div>

          <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-5">
            <p className="text-sm text-white/50">Total a pagar</p>
            <p className="text-2xl font-black">{formatMoney(total)}</p>
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-white/35">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm outline-none focus:border-[#ff5a2a]/50"
      />
    </label>
  );
}
