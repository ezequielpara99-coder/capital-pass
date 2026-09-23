"use client";

import Link from "next/link";
import { useState } from "react";

type Complaint = {
  id: string; organizationName: string; subject: string; message: string; status: string;
  admin_response: string | null; created_at: string; resolved_at: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));
}

export default function ReclamosClient({ complaints }: { complaints: Complaint[] }) {
  const [items, setItems] = useState(complaints);
  const [openId, setOpenId] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function resolve(complaintId: string) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/complaints", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaintId, adminResponse: response.trim() || null }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setItems((prev) => prev.map((c) => (c.id === complaintId ? { ...c, status: "resuelto", admin_response: response.trim() || null, resolved_at: new Date().toISOString() } : c)));
      setOpenId(null);
      setResponse("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo resolver el reclamo.");
    } finally {
      setSaving(false);
    }
  }

  const abiertos = items.filter((c) => c.status !== "resuelto");
  const resueltos = items.filter((c) => c.status === "resuelto");

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[1100px] px-5 py-8 md:px-8 xl:px-10">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href="/admin" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Admin
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass admin</p>
          <h1 className="mt-3 text-[clamp(36px,5vw,64px)] font-black uppercase leading-[0.9] tracking-[-0.05em]">Reclamos.</h1>
        </header>

        {error && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <section className="mt-8">
          <h2 className="text-sm font-black uppercase tracking-wide text-white/50">Abiertos ({abiertos.length})</h2>
          <div className="mt-4 space-y-3">
            {abiertos.map((c) => (
              <div key={c.id} className="border border-amber-400/20 bg-amber-400/[0.04] p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-white/40">{c.organizationName}</p>
                  <p className="text-[10px] text-white/30">{formatDate(c.created_at)}</p>
                </div>
                <p className="mt-2 text-lg font-bold">{c.subject}</p>
                <p className="mt-1 text-sm text-white/60">{c.message}</p>

                {openId === c.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Respuesta para el organizador (opcional)"
                      rows={2} className="w-full border border-white/15 bg-black px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button type="button" disabled={saving} onClick={() => resolve(c.id)} className="h-9 border border-emerald-400/30 bg-emerald-400/10 px-4 text-xs font-bold text-emerald-300 disabled:opacity-40">
                        {saving ? "Guardando..." : "Marcar resuelto"}
                      </button>
                      <button type="button" onClick={() => { setOpenId(null); setResponse(""); }} className="h-9 border border-white/15 px-4 text-xs text-white/50">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setOpenId(c.id)} className="mt-3 h-9 border border-white/15 px-4 text-xs font-bold text-white/60">
                    Responder / resolver
                  </button>
                )}
              </div>
            ))}
            {abiertos.length === 0 && <p className="text-sm text-white/30">No hay reclamos abiertos.</p>}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-black uppercase tracking-wide text-white/50">Resueltos ({resueltos.length})</h2>
          <div className="mt-4 space-y-3">
            {resueltos.map((c) => (
              <div key={c.id} className="border border-white/10 bg-white/[0.02] p-5 opacity-70">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-white/40">{c.organizationName}</p>
                  <p className="text-[10px] text-white/30">{formatDate(c.created_at)}</p>
                </div>
                <p className="mt-2 font-bold">{c.subject}</p>
                <p className="mt-1 text-sm text-white/50">{c.message}</p>
                {c.admin_response && <p className="mt-2 text-sm text-emerald-300">↳ {c.admin_response}</p>}
              </div>
            ))}
            {resueltos.length === 0 && <p className="text-sm text-white/30">Todavía no resolviste ningún reclamo.</p>}
          </div>
        </section>
      </section>
    </main>
  );
}
