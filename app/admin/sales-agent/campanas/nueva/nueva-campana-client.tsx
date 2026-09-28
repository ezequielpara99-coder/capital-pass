"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { SalesAgentHeader, INPUT, LABEL, CATEGORY_LABEL } from "../../nav";

export default function NuevaCampanaClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [minScore, setMinScore] = useState("0");
  const [targetCount, setTargetCount] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [messageStyle, setMessageStyle] = useState("natural");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleCategory(cat: string) {
    setCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/sales-agent/campanas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, city, province, categories, minScore, targetCount, channel, messageStyle, notes }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo crear la campaña.");
      router.push(`/admin/sales-agent/prospectos?campaignId=${result.campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la campaña.");
      setSaving(false);
    }
  }

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[700px] px-5 py-8 md:px-8">
        <SalesAgentHeader active="campanas" title="Nueva campaña." subtitle="Definí el objetivo. Después cargás o importás los prospectos que correspondan a esta campaña." />

        <form onSubmit={submit} className="mt-8 border border-white/[0.08] bg-white/[0.02] p-5">
          {error && <div className="mb-4 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

          <label className="block">
            <span className={LABEL}>Nombre *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rosario — Boliches — Octubre 2026" className={INPUT} />
          </label>

          <div className="grid gap-x-4 sm:grid-cols-2">
            <label className="mt-3 block">
              <span className={LABEL}>Ciudad</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Rosario" className={INPUT} />
            </label>
            <label className="mt-3 block">
              <span className={LABEL}>Provincia</span>
              <input value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Santa Fe" className={INPUT} />
            </label>
          </div>

          <div className="mt-3">
            <span className={LABEL}>Categorías</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleCategory(key)}
                  className={`h-9 border px-3 text-[10px] font-black uppercase tracking-wide ${categories.includes(key) ? "border-[#ff5a2a]/60 bg-[#ff5a2a]/10 text-white" : "border-white/15 text-white/50"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-x-4 sm:grid-cols-2">
            <label className="mt-3 block">
              <span className={LABEL}>Puntaje mínimo (0-100)</span>
              <input value={minScore} onChange={(e) => setMinScore(e.target.value)} inputMode="numeric" className={INPUT} />
            </label>
            <label className="mt-3 block">
              <span className={LABEL}>Cantidad objetivo (opcional)</span>
              <input value={targetCount} onChange={(e) => setTargetCount(e.target.value)} inputMode="numeric" placeholder="50" className={INPUT} />
            </label>
          </div>

          <div className="grid gap-x-4 sm:grid-cols-2">
            <label className="mt-3 block">
              <span className={LABEL}>Canal</span>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className={INPUT}>
                <option value="whatsapp" className="bg-black">WhatsApp</option>
                <option value="instagram" className="bg-black">Instagram</option>
                <option value="email" className="bg-black">Email</option>
              </select>
            </label>
            <label className="mt-3 block">
              <span className={LABEL}>Estilo de mensaje</span>
              <select value={messageStyle} onChange={(e) => setMessageStyle(e.target.value)} className={INPUT}>
                <option value="directo" className="bg-black">Directo</option>
                <option value="natural" className="bg-black">Natural</option>
                <option value="profesional" className="bg-black">Profesional</option>
              </select>
            </label>
          </div>

          <label className="mt-3 block">
            <span className={LABEL}>Notas</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT} />
          </label>

          <button type="submit" disabled={saving || !name.trim()} className="mt-5 h-12 w-full bg-[#ff2a1a] text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d] disabled:opacity-40 sm:w-auto sm:px-8">
            {saving ? "Creando…" : "Iniciar campaña"}
          </button>
        </form>
      </section>
    </main>
  );
}
