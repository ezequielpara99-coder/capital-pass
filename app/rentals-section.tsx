"use client";

import { useState } from "react";

export default function RentalsSection() {
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [terminalQuantity, setTerminalQuantity] = useState("");
  const [message, setMessage] = useState("");

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim() || !contactName.trim() || !phone.trim()) {
      setError("Completá negocio, contacto y teléfono.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/rentals/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          contactName,
          phone,
          email: email || null,
          city: city || null,
          terminalQuantity: terminalQuantity || null,
          message: message || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo enviar la consulta.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la consulta.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="relative z-10 overflow-hidden border-b border-[var(--cp-border)] bg-black text-white">
      <div className="pointer-events-none absolute -left-40 top-0 h-[420px] w-[420px] rounded-full bg-[#ff2a1a]/[0.12] blur-[140px]" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-[420px] w-[420px] rounded-full bg-[#ff6530]/[0.10] blur-[140px]" />

      <div className="relative mx-auto grid max-w-[1560px] gap-14 px-5 py-24 md:px-8 lg:grid-cols-2 xl:px-10">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass</p>
          <h2 className="mt-4 text-[clamp(40px,6vw,76px)] font-black uppercase leading-[0.88] tracking-[-0.05em]">
            Capital Rentals
          </h2>
          <p className="mt-6 max-w-md text-sm leading-7 text-white/50">
            Alquilá terminales de venta listas para usar en tu bar, boliche o evento: cobrá en efectivo o
            transferencia, imprimí tickets y controlá el stock desde el primer día, sin comprar el equipo.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-white/60">
            {[
              "Terminales configuradas y listas para vender",
              "Soporte para instalación y puesta en marcha",
              "Ideal para bares, boliches y eventos puntuales",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 text-[#ff6545]">+</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-[28px] border border-white/[0.10] bg-white/[0.03] p-6 backdrop-blur-xl md:p-8">
          {sent ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-2xl text-emerald-300">
                ✓
              </div>
              <p className="mt-5 text-lg font-black uppercase tracking-tight">Consulta enviada</p>
              <p className="mt-2 max-w-xs text-sm text-white/45">Te vamos a contactar a la brevedad para coordinar el alquiler.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Contanos sobre tu negocio</p>

              {error && (
                <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre del negocio" value={businessName} onChange={setBusinessName} required />
                <Field label="Nombre de contacto" value={contactName} onChange={setContactName} required />
                <Field label="Teléfono / WhatsApp" value={phone} onChange={setPhone} required />
                <Field label="Email (opcional)" value={email} onChange={setEmail} type="email" />
                <Field label="Ciudad (opcional)" value={city} onChange={setCity} />
                <Field label="Cantidad de terminales" value={terminalQuantity} onChange={setTerminalQuantity} />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-white/40">Mensaje (opcional)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50"
                />
              </div>

              <button
                type="submit"
                disabled={sending}
                className="flex h-14 w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] text-sm font-black uppercase tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending ? "Enviando..." : "Enviar consulta"}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-wide text-white/40">
        {label}
        {required && <span className="text-[#ff6545]"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-white/[0.03] px-4 text-sm text-white outline-none focus:border-[#ff5a2a]/50"
      />
    </div>
  );
}
