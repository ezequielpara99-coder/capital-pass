"use client";

import Link from "next/link";
import { useState } from "react";

type Inquiry = {
  id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string | null;
  city: string | null;
  terminal_quantity: string | null;
  message: string | null;
  status: string;
  created_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

const STATUS_LABEL: Record<string, string> = { nuevo: "Nuevo", contactado: "Contactado", cerrado: "Cerrado" };
const STATUS_STYLE: Record<string, string> = {
  nuevo: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  contactado: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  cerrado: "border-white/15 bg-white/[0.03] text-white/40",
};

export default function RentalsClient({ inquiries }: { inquiries: Inquiry[] }) {
  const [items, setItems] = useState(inquiries);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function setStatus(inquiryId: string, status: string) {
    setSavingId(inquiryId);
    setError("");
    try {
      const response = await fetch("/api/rentals/inquiries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inquiryId, status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar.");
      setItems((prev) => prev.map((i) => (i.id === inquiryId ? { ...i, status } : i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[1200px] px-5 py-8 md:px-8 xl:px-10">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href="/admin" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Admin
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass admin</p>
          <h1 className="mt-3 text-[clamp(36px,5vw,64px)] font-black uppercase leading-[0.9] tracking-[-0.05em]">Capital Rentals.</h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">Consultas de alquiler de terminales enviadas desde la landing.</p>
        </header>

        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {items.length === 0 ? (
          <div className="mt-8 border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">
            Todavía no llegó ninguna consulta.
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {items.map((inquiry) => (
              <div key={inquiry.id} className="border border-white/[0.08] bg-white/[0.02] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-black">{inquiry.business_name}</p>
                    <p className="text-xs text-white/40">{inquiry.contact_name} · {inquiry.phone}{inquiry.email ? ` · ${inquiry.email}` : ""}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide ${STATUS_STYLE[inquiry.status] ?? STATUS_STYLE.nuevo}`}>
                    {STATUS_LABEL[inquiry.status] ?? inquiry.status}
                  </span>
                </div>

                <div className="mt-3 grid gap-1 text-sm text-white/55 sm:grid-cols-2">
                  {inquiry.city && <p>Ciudad: {inquiry.city}</p>}
                  {inquiry.terminal_quantity && <p>Terminales: {inquiry.terminal_quantity}</p>}
                </div>
                {inquiry.message && <p className="mt-2 text-sm text-white/50">&quot;{inquiry.message}&quot;</p>}

                <div className="mt-4 flex items-center justify-between">
                  <p className="text-[10px] text-white/25">{formatDate(inquiry.created_at)}</p>
                  <div className="flex gap-2">
                    {(["nuevo", "contactado", "cerrado"] as const)
                      .filter((s) => s !== inquiry.status)
                      .map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={savingId === inquiry.id}
                          onClick={() => setStatus(inquiry.id, s)}
                          className="h-9 rounded-lg border border-white/15 bg-white/[0.03] px-3 text-[10px] font-black uppercase tracking-wide text-white/60 hover:border-[#ff5a2a]/40 hover:text-white disabled:opacity-30"
                        >
                          Marcar {STATUS_LABEL[s]}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
