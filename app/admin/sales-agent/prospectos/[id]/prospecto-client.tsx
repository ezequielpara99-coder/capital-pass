"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { INPUT, LABEL, POTENTIAL_LABEL, POTENTIAL_STYLE, STATUS_LABEL, CATEGORY_LABEL, TICKETING_LABEL } from "../../nav";

type Prospect = {
  id: string; name: string; instagram_username: string | null; instagram_url: string | null; website: string | null;
  city: string | null; province: string | null; category: string | null; followers: number | null; events_per_month: number | null;
  email: string | null; phone: string | null; whatsapp: string | null; ticketing_provider: string | null; ticketing_url: string | null;
  ticketing_confidence: string | null; score: number; score_reasons: string[]; score_missing: string[]; potential: string; status: string;
  notes: string | null; last_contacted_at: string | null; next_followup_at: string | null; investigated_at: string | null;
};
type Opportunity = { id: string; type: string; description: string; priority: string };
type Message = { id: string; channel: string; style: string; message: string; status: string; created_at: string };
type Followup = { id: string; scheduled_at: string; status: string; notes: string | null };
type Interaction = { id: string; channel: string | null; type: string; content: string; created_at: string };

const STATUS_OPTIONS = Object.keys(STATUS_LABEL);
const FIELD_KEYS = ["name", "instagramUsername", "website", "city", "province", "category", "followers", "eventsPerMonth", "email", "phone", "whatsapp", "notes"] as const;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));
}

export default function ProspectoClient({ id }: { id: string }) {
  const [data, setData] = useState<{ prospect: Prospect; opportunities: Opportunity[]; messages: Message[]; followups: Followup[]; interactions: Interaction[] } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [investigateUrl, setInvestigateUrl] = useState("");
  const [investigating, setInvestigating] = useState(false);

  const [variants, setVariants] = useState<{ directo: string; natural: string; profesional: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageStyle, setMessageStyle] = useState<"directo" | "natural" | "profesional">("natural");
  const [messageChannel, setMessageChannel] = useState("whatsapp");
  const [savingMessage, setSavingMessage] = useState(false);

  const [followupDate, setFollowupDate] = useState("");
  const [interactionType, setInteractionType] = useState("nota");
  const [interactionContent, setInteractionContent] = useState("");
  const [savingInteraction, setSavingInteraction] = useState(false);

  async function load() {
    try {
      const response = await fetch(`/api/admin/sales-agent/prospectos/${id}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo cargar.");
      setData(result);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function startEdit() {
    if (!data) return;
    const p = data.prospect;
    setEdit({
      name: p.name, instagramUsername: p.instagram_username ?? "", website: p.website ?? "", city: p.city ?? "", province: p.province ?? "",
      category: p.category ?? "", followers: p.followers?.toString() ?? "", eventsPerMonth: p.events_per_month?.toString() ?? "",
      email: p.email ?? "", phone: p.phone ?? "", whatsapp: p.whatsapp ?? "", notes: p.notes ?? "",
    });
    setEditing(true);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {};
      for (const key of FIELD_KEYS) body[key] = edit[key] ?? "";
      const response = await fetch(`/api/admin/sales-agent/prospectos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: string) {
    setError("");
    try {
      const response = await fetch(`/api/admin/sales-agent/prospectos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    }
  }

  async function investigate() {
    if (investigating) return;
    setInvestigating(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/sales-agent/prospectos/${id}/investigar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: investigateUrl || undefined }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo investigar.");
      setNotice(`Investigado: ${result.investigatedUrl}`);
      setInvestigateUrl("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo investigar.");
    } finally {
      setInvestigating(false);
    }
  }

  async function generateMessages() {
    if (generating) return;
    setGenerating(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/sales-agent/prospectos/${id}/mensajes`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudieron generar los mensajes.");
      setVariants(result.variants);
      setMessageDraft(result.variants.natural);
      setMessageStyle("natural");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron generar los mensajes.");
    } finally {
      setGenerating(false);
    }
  }

  function pickVariant(style: "directo" | "natural" | "profesional") {
    if (!variants) return;
    setMessageStyle(style);
    setMessageDraft(variants[style]);
  }

  async function saveMessage(status: "borrador" | "aprobado" | "enviado" | "descartado") {
    if (savingMessage || !messageDraft.trim()) return;
    setSavingMessage(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/sales-agent/prospectos/${id}/mensajes`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageDraft, style: messageStyle, channel: messageChannel, status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");
      setNotice(status === "enviado" ? "Mensaje marcado como enviado. Se programó un seguimiento en 3 días." : "Mensaje guardado.");
      setVariants(null);
      setMessageDraft("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSavingMessage(false);
    }
  }

  async function scheduleFollowup(e: FormEvent) {
    e.preventDefault();
    if (!followupDate) return;
    setError("");
    try {
      const response = await fetch(`/api/admin/sales-agent/prospectos/${id}/seguimientos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledAt: new Date(followupDate).toISOString() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo programar.");
      setFollowupDate("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo programar.");
    }
  }

  async function resolveFollowup(followupId: string, status: "hecho" | "omitido") {
    setError("");
    try {
      const response = await fetch(`/api/admin/sales-agent/prospectos/${id}/seguimientos`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ followupId, status }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    }
  }

  async function addInteraction(e: FormEvent) {
    e.preventDefault();
    if (savingInteraction || !interactionContent.trim()) return;
    setSavingInteraction(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/sales-agent/prospectos/${id}/interacciones`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: interactionType, content: interactionContent }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");
      setInteractionContent("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSavingInteraction(false);
    }
  }

  if (!data && !error) {
    return <main className="flex min-h-screen items-center justify-center bg-[#050505] text-sm text-white/35">Cargando…</main>;
  }
  if (!data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#050505] text-sm text-red-300">
        {error}
        <Link href="/admin/sales-agent/prospectos" className="text-white/50 underline">Volver</Link>
      </main>
    );
  }

  const p = data.prospect;

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <Link href="/admin/sales-agent/prospectos" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
          ← Prospectos
        </Link>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">{CATEGORY_LABEL[p.category ?? ""] ?? "Prospecto"}</p>
            <h1 className="mt-2 text-[clamp(26px,4vw,40px)] font-black uppercase leading-[0.95] tracking-[-0.03em]">{p.name}</h1>
            <p className="mt-2 text-sm text-white/45">{[p.city, p.province].filter(Boolean).join(", ") || "Sin ubicación"}</p>
          </div>
          <div className={`border px-4 py-3 text-center ${POTENTIAL_STYLE[p.potential]}`}>
            <p className="text-[9px] font-black uppercase tracking-wide">{POTENTIAL_LABEL[p.potential]}</p>
            <p className="text-3xl font-black">{p.score}</p>
          </div>
        </div>

        {notice && <div className="mt-5 border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}
        {error && <div className="mt-5 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <div className="mt-6 flex flex-wrap gap-2">
          <select value={p.status} onChange={(e) => changeStatus(e.target.value)} className="h-11 border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50">
            {STATUS_OPTIONS.map((s) => <option key={s} value={s} className="bg-black">{STATUS_LABEL[s]}</option>)}
          </select>
          <button type="button" onClick={startEdit} className="h-11 border border-white/[0.14] px-4 text-[10px] font-black uppercase tracking-wide text-white/70 hover:text-white">Editar datos</button>
          {p.status === "interesado" || p.status === "demo" || p.status === "negociacion" ? (
            <ConvertButton id={id} onDone={load} setError={setError} setNotice={setNotice} />
          ) : null}
        </div>

        {/* Datos de contacto */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <InfoRow label="Instagram" value={p.instagram_username ? `@${p.instagram_username}` : null} href={p.instagram_url ?? undefined} />
          <InfoRow label="Web" value={p.website} href={p.website ?? undefined} />
          <InfoRow label="Email" value={p.email} href={p.email ? `mailto:${p.email}` : undefined} />
          <InfoRow label="Teléfono" value={p.phone} />
          <InfoRow label="WhatsApp" value={p.whatsapp} href={p.whatsapp ? `https://wa.me/${p.whatsapp.replace(/\D/g, "")}` : undefined} />
          <InfoRow label="Seguidores" value={p.followers?.toLocaleString("es-AR") ?? null} />
          <InfoRow label="Eventos por mes" value={p.events_per_month?.toString() ?? null} />
          <InfoRow label="Sistema de tickets" value={p.ticketing_provider ? `${TICKETING_LABEL[p.ticketing_provider] ?? p.ticketing_provider}${p.ticketing_confidence ? ` (confianza ${p.ticketing_confidence})` : ""}` : "Información no encontrada"} href={p.ticketing_url ?? undefined} />
        </div>

        {editing && (
          <form onSubmit={saveEdit} className="mt-6 border border-white/[0.08] bg-white/[0.02] p-5">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Editar</p>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {(["name", "instagramUsername", "website", "city", "province", "email", "phone", "whatsapp"] as const).map((key) => (
                <label key={key} className="mt-3 block">
                  <span className={LABEL}>{key}</span>
                  <input value={edit[key] ?? ""} onChange={(e) => setEdit((d) => ({ ...d, [key]: e.target.value }))} className={INPUT} />
                </label>
              ))}
              <label className="mt-3 block">
                <span className={LABEL}>category</span>
                <select value={edit.category ?? ""} onChange={(e) => setEdit((d) => ({ ...d, category: e.target.value }))} className={INPUT}>
                  <option value="" className="bg-black">—</option>
                  {Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k} className="bg-black">{l}</option>)}
                </select>
              </label>
              <label className="mt-3 block"><span className={LABEL}>followers</span><input value={edit.followers ?? ""} onChange={(e) => setEdit((d) => ({ ...d, followers: e.target.value }))} inputMode="numeric" className={INPUT} /></label>
              <label className="mt-3 block"><span className={LABEL}>eventsPerMonth</span><input value={edit.eventsPerMonth ?? ""} onChange={(e) => setEdit((d) => ({ ...d, eventsPerMonth: e.target.value }))} inputMode="numeric" className={INPUT} /></label>
            </div>
            <label className="mt-3 block"><span className={LABEL}>notes</span><input value={edit.notes ?? ""} onChange={(e) => setEdit((d) => ({ ...d, notes: e.target.value }))} className={INPUT} /></label>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={saving} onClick={() => setEditing(false)} className="h-11 border border-white/15 px-4 text-[10px] font-black uppercase tracking-wide text-white/60">Cancelar</button>
              <button type="submit" disabled={saving} className="h-11 bg-[#ff2a1a] px-5 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-40">{saving ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        )}

        {/* Score */}
        <div className="mt-6 border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Por qué este puntaje</p>
          {p.score_reasons.length > 0 && (
            <ul className="mt-3 space-y-1">
              {p.score_reasons.map((r, i) => <li key={i} className="text-sm text-emerald-300">+ {r}</li>)}
            </ul>
          )}
          {p.score_missing.length > 0 && (
            <>
              <p className="mt-4 text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Datos faltantes</p>
              <ul className="mt-2 space-y-1">
                {p.score_missing.map((r, i) => <li key={i} className="text-sm text-white/40">− {r}</li>)}
              </ul>
            </>
          )}
        </div>

        {/* Investigar */}
        <div className="mt-6 border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Investigar</p>
          <p className="mt-1 text-xs text-white/35">Trae la página pública que indiques (o la web/Instagram ya cargados) y detecta el sistema de venta, herramientas y oportunidades.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input value={investigateUrl} onChange={(e) => setInvestigateUrl(e.target.value)} placeholder={p.website || p.instagram_url || "https://…"} className="h-11 flex-1 min-w-[220px] border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50" />
            <button type="button" disabled={investigating} onClick={investigate} className="h-11 bg-[#ff2a1a] px-5 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-40">{investigating ? "Investigando…" : "Investigar"}</button>
          </div>
          {p.investigated_at && <p className="mt-2 text-[11px] text-white/35">Última investigación: {formatDate(p.investigated_at)}</p>}
        </div>

        {/* Oportunidades */}
        {data.opportunities.length > 0 && (
          <div className="mt-6 border border-white/[0.08] bg-white/[0.02] p-5">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Oportunidades detectadas</p>
            <div className="mt-3 space-y-2">
              {data.opportunities.map((o) => (
                <div key={o.id} className="border-l-2 border-[#ff5a2a]/50 pl-3">
                  <p className="text-sm text-white/80">{o.description}</p>
                  <p className="text-[10px] uppercase tracking-wide text-white/30">Prioridad {o.priority}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mensajes */}
        <div className="mt-6 border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Mensaje comercial</p>
          {!variants ? (
            <button type="button" disabled={generating} onClick={generateMessages} className="mt-3 h-11 bg-[#ff2a1a] px-5 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-40">{generating ? "Generando…" : "Generar mensajes"}</button>
          ) : (
            <>
              <div className="mt-3 flex gap-2">
                {(["directo", "natural", "profesional"] as const).map((style) => (
                  <button key={style} type="button" onClick={() => pickVariant(style)} className={`h-9 border px-3 text-[10px] font-black uppercase tracking-wide ${messageStyle === style ? "border-[#ff5a2a]/60 bg-[#ff5a2a]/10 text-white" : "border-white/15 text-white/50"}`}>{style}</button>
                ))}
              </div>
              <textarea value={messageDraft} onChange={(e) => setMessageDraft(e.target.value)} rows={5} className="mt-3 w-full border border-white/[0.12] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#ff5a2a]/50" />
              <select value={messageChannel} onChange={(e) => setMessageChannel(e.target.value)} className="mt-2 h-10 border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50">
                <option value="whatsapp" className="bg-black">WhatsApp</option>
                <option value="instagram" className="bg-black">Instagram</option>
                <option value="email" className="bg-black">Email</option>
              </select>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={savingMessage} onClick={() => saveMessage("descartado")} className="h-10 border border-red-400/20 px-4 text-[10px] font-black uppercase tracking-wide text-red-300/70">Descartar</button>
                <button type="button" disabled={savingMessage} onClick={() => saveMessage("aprobado")} className="h-10 border border-white/15 px-4 text-[10px] font-black uppercase tracking-wide text-white/70">Aprobar</button>
                <button type="button" disabled={savingMessage} onClick={() => saveMessage("enviado")} className="h-10 bg-emerald-500 px-4 text-[10px] font-black uppercase tracking-wide text-black disabled:opacity-40">Marcar como enviado</button>
              </div>
              <p className="mt-2 text-[11px] text-white/30">Copiá el texto y mandalo desde WhatsApp/Instagram/email. &quot;Marcar como enviado&quot; programa un seguimiento en 3 días.</p>
            </>
          )}

          {data.messages.length > 0 && (
            <div className="mt-5 space-y-2 border-t border-white/[0.06] pt-4">
              {data.messages.map((m) => (
                <div key={m.id} className="border border-white/[0.06] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-white/35">{m.channel} · {m.style} · {m.status} · {formatDate(m.created_at)}</p>
                  <p className="mt-1 text-sm text-white/70">{m.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Seguimientos */}
        <div className="mt-6 border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Seguimientos</p>
          <form onSubmit={scheduleFollowup} className="mt-3 flex flex-wrap gap-2">
            <input type="datetime-local" value={followupDate} onChange={(e) => setFollowupDate(e.target.value)} className="h-11 border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50" />
            <button type="submit" disabled={!followupDate} className="h-11 border border-white/[0.14] px-4 text-[10px] font-black uppercase tracking-wide text-white/70 disabled:opacity-40">Programar</button>
          </form>
          <div className="mt-3 space-y-2">
            {data.followups.length === 0 ? <p className="text-sm text-white/30">Sin seguimientos programados.</p> : data.followups.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 border border-white/[0.06] px-3 py-2">
                <span className="text-sm text-white/70">{formatDate(f.scheduled_at)} {f.notes ? `· ${f.notes}` : ""}</span>
                {f.status === "pendiente" ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => resolveFollowup(f.id, "hecho")} className="h-8 border border-emerald-400/25 px-2 text-[9px] font-black uppercase tracking-wide text-emerald-300">Hecho</button>
                    <button type="button" onClick={() => resolveFollowup(f.id, "omitido")} className="h-8 border border-white/15 px-2 text-[9px] font-black uppercase tracking-wide text-white/50">Omitir</button>
                  </div>
                ) : <span className="text-[10px] uppercase tracking-wide text-white/35">{f.status}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Notas / respuestas */}
        <div className="mt-6 mb-10 border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Notas y respuestas</p>
          <form onSubmit={addInteraction} className="mt-3">
            <select value={interactionType} onChange={(e) => setInteractionType(e.target.value)} className="h-10 border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50">
              <option value="nota" className="bg-black">Nota</option>
              <option value="respuesta" className="bg-black">Respuesta del prospecto</option>
              <option value="llamada" className="bg-black">Llamada</option>
              <option value="reunion" className="bg-black">Reunión</option>
            </select>
            <textarea value={interactionContent} onChange={(e) => setInteractionContent(e.target.value)} rows={2} placeholder="Pegá acá lo que te respondió, o dejá una nota…" className="mt-2 w-full border border-white/[0.12] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#ff5a2a]/50" />
            <button type="submit" disabled={savingInteraction || !interactionContent.trim()} className="mt-2 h-10 border border-white/[0.14] px-4 text-[10px] font-black uppercase tracking-wide text-white/70 disabled:opacity-40">{savingInteraction ? "Guardando…" : "Guardar"}</button>
          </form>
          <div className="mt-4 space-y-2">
            {data.interactions.map((it) => (
              <div key={it.id} className="border-l-2 border-white/15 pl-3">
                <p className="text-[10px] uppercase tracking-wide text-white/35">{it.type} · {formatDate(it.created_at)}</p>
                <p className="text-sm text-white/70">{it.content}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function InfoRow({ label, value, href }: { label: string; value: string | null; href?: string }) {
  return (
    <div className="border border-white/[0.06] px-3 py-2">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/35">{label}</p>
      {value ? (
        href ? <a href={href} target="_blank" rel="noopener noreferrer" className="mt-0.5 block truncate text-sm text-[#ff9b82] hover:underline">{value}</a> : <p className="mt-0.5 truncate text-sm text-white/80">{value}</p>
      ) : (
        <p className="mt-0.5 text-sm text-white/25">Información no encontrada</p>
      )}
    </div>
  );
}

function ConvertButton({ id, onDone, setError, setNotice }: { id: string; onDone: () => void; setError: (v: string) => void; setNotice: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [planLabel, setPlanLabel] = useState("");
  const [monthlyValue, setMonthlyValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/sales-agent/prospectos/${id}/convertir`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planLabel, monthlyValue }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo registrar.");
      setNotice("¡Convertido en cliente!");
      setOpen(false);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="h-11 bg-emerald-500 px-4 text-[10px] font-black uppercase tracking-wide text-black">Convertir en cliente</button>;
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 border border-emerald-400/25 bg-emerald-400/[0.06] px-3 py-2">
      <input value={planLabel} onChange={(e) => setPlanLabel(e.target.value)} placeholder="Plan" className="h-9 w-32 border border-white/[0.12] bg-black/30 px-2 text-sm text-white outline-none" />
      <input value={monthlyValue} onChange={(e) => setMonthlyValue(e.target.value)} placeholder="$/mes" inputMode="numeric" className="h-9 w-24 border border-white/[0.12] bg-black/30 px-2 text-sm text-white outline-none" />
      <button type="submit" disabled={busy} className="h-9 bg-emerald-500 px-3 text-[9px] font-black uppercase tracking-wide text-black disabled:opacity-40">Confirmar</button>
      <button type="button" onClick={() => setOpen(false)} className="h-9 border border-white/15 px-3 text-[9px] font-black uppercase tracking-wide text-white/50">Cancelar</button>
    </form>
  );
}
