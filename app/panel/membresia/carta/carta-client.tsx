"use client";

import { FormEvent, useEffect, useState } from "react";
import { FIELD_INPUT, FIELD_LABEL, MembresiaHeader, formatMoney } from "../membresia-nav";

type Kind = "trago" | "combo" | "premio";
type Winner = { id: string; period: string; position: number; points: number; prize: string; claimed_at: string | null; memberName: string };
type Item = { id: string; kind: Kind; name: string; description: string | null; price_minor: number; points_earned: number; points_cost: number | null; active: boolean };

const KIND_LABEL: Record<Kind, string> = { trago: "Trago", combo: "Combo", premio: "Premio (se canjea con puntos)" };
const KIND_TITLE: Record<Kind, string> = { trago: "Tragos", combo: "Combos", premio: "Premios" };

export default function CartaClient() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [checkinPoints, setCheckinPoints] = useState("0");
  const [savedCheckin, setSavedCheckin] = useState("0");
  const [rankingEnabled, setRankingEnabled] = useState(true);
  const [prizes, setPrizes] = useState<string[]>(["", "", ""]);
  const [savedPrizes, setSavedPrizes] = useState<string[]>(["", "", ""]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState("");
  const [saving, setSaving] = useState(false);

  const [kind, setKind] = useState<Kind>("trago");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [pointsEarned, setPointsEarned] = useState("");
  const [pointsCost, setPointsCost] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", price: "", pointsEarned: "", pointsCost: "" });

  async function load() {
    try {
      const response = await fetch("/api/panel/membresia-carta");
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 403 || response.status === 503) setBlocked(result.error);
        throw new Error(result.error ?? "No se pudo cargar.");
      }
      setItems(result.items);
      setCheckinPoints(String(result.checkinPoints));
      setSavedCheckin(String(result.checkinPoints));
      setRankingEnabled(result.rankingEnabled !== false);
      setPrizes(result.prizes);
      setSavedPrizes(result.prizes);
      setWinners(result.winners);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
    }
  }

  async function savePrizes() {
    setError("");
    try {
      const result = await request("PATCH", { monthlyPrizes: prizes });
      setPrizes(result.prizes);
      setSavedPrizes(result.prizes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  async function markDelivered(winner: Winner) {
    setError("");
    try {
      const result = await request("PATCH", { claimWinnerId: winner.id });
      setWinners((prev) => prev.map((w) => (w.id === winner.id ? { ...w, claimed_at: result.claimedAt } : w)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  async function toggleRanking() {
    setError("");
    try {
      const result = await request("PATCH", { rankingEnabled: !rankingEnabled });
      setRankingEnabled(result.rankingEnabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function request(method: string, body?: unknown, query = "") {
    const response = await fetch(`/api/panel/membresia-carta${query}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");
    return result;
  }

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await request("POST", { kind, name, description, price, pointsEarned: pointsEarned || 0, pointsCost });
      setItems((prev) => [...(prev ?? []), result.item]);
      setName("");
      setDescription("");
      setPrice("");
      setPointsEarned("");
      setPointsCost("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCheckin() {
    setError("");
    try {
      const result = await request("PATCH", { checkinPoints });
      setSavedCheckin(String(result.checkinPoints));
      setCheckinPoints(String(result.checkinPoints));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  async function toggleActive(item: Item) {
    setError("");
    try {
      const result = await request("PATCH", { id: item.id, active: !item.active });
      setItems((prev) => (prev ?? []).map((i) => (i.id === item.id ? result.item : i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  function startEdit(item: Item) {
    setEditingId(item.id);
    setEdit({
      name: item.name,
      price: String(item.price_minor),
      pointsEarned: String(item.points_earned),
      pointsCost: String(item.points_cost ?? ""),
    });
  }

  async function saveEdit(item: Item) {
    setError("");
    try {
      const body = item.kind === "premio" ? { id: item.id, name: edit.name, pointsCost: edit.pointsCost } : { id: item.id, name: edit.name, price: edit.price, pointsEarned: edit.pointsEarned || 0 };
      const result = await request("PATCH", body);
      setItems((prev) => (prev ?? []).map((i) => (i.id === item.id ? result.item : i)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  async function remove(item: Item) {
    if (!window.confirm(`¿Sacar "${item.name}" de la carta?`)) return;
    setError("");
    try {
      await request("DELETE", undefined, `?id=${item.id}`);
      setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    }
  }

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <MembresiaHeader active="carta" title="Carta y puntos." subtitle="Lo que tus socios piden desde su app, cuántos puntos suma cada compra y los premios que pueden canjear." />

        {blocked && <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">{blocked}</div>}
        {error && !blocked && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {!blocked && (
          <>
            <div className="mt-8 border border-white/[0.08] bg-white/[0.02] p-5">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Puntos por asistir a una fiesta</p>
              <p className="mt-1 text-xs text-white/35">Se suman una vez por fiesta cuando la puerta escanea el carnet. 0 = no da puntos.</p>
              <div className="mt-3 flex items-end gap-2">
                <input value={checkinPoints} onChange={(e) => setCheckinPoints(e.target.value)} inputMode="numeric" className="h-12 w-32 border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none focus:border-[#ff5a2a]/50" />
                <button type="button" disabled={checkinPoints === savedCheckin} onClick={saveCheckin} className="h-12 bg-[#ff2a1a] px-6 text-[10px] font-black uppercase tracking-[0.16em] text-white disabled:opacity-30">
                  Guardar
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-white/[0.08] bg-white/[0.02] p-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Ranking de socios</p>
                <p className="mt-1 max-w-md text-xs text-white/35">Los socios ven una tabla de posiciones por puntos ganados (mensual e histórica), con nombre e inicial del apellido.</p>
              </div>
              <button type="button" onClick={toggleRanking} className={`h-11 border px-5 text-[10px] font-black uppercase tracking-[0.14em] ${rankingEnabled ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-white/15 text-white/50"}`}>
                {rankingEnabled ? "Visible" : "Oculto"}
              </button>
            </div>

            <div className="mt-6 border border-amber-400/25 bg-amber-400/[0.04] p-5">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-300">Premios del ranking mensual</p>
              <p className="mt-1 text-xs text-white/40">Al terminar cada mes, los mejores del ranking ganan estos premios. Un puesto vacío no tiene premio. Si hay empate, gana quien llegó primero a ese puntaje.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <label key={i} className="block">
                    <span className={FIELD_LABEL}>{["🥇 Puesto 1", "🥈 Puesto 2", "🥉 Puesto 3"][i]}</span>
                    <input
                      value={prizes[i] ?? ""}
                      onChange={(e) => setPrizes((prev) => prev.map((p, index) => (index === i ? e.target.value : p)))}
                      maxLength={120}
                      placeholder={["Mesa VIP gratis", "2 tragos gratis", "1 trago gratis"][i]}
                      className={FIELD_INPUT}
                    />
                  </label>
                ))}
              </div>
              <button type="button" disabled={prizes.join("|") === savedPrizes.join("|")} onClick={savePrizes} className="mt-4 h-11 bg-[#ff2a1a] px-6 text-[10px] font-black uppercase tracking-[0.16em] text-white disabled:opacity-30">
                Guardar premios
              </button>

              {winners.length > 0 && (
                <div className="mt-6 border-t border-white/[0.08] pt-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Ganadores</p>
                  <div className="mt-3 space-y-2">
                    {winners.map((winner) => (
                      <div key={winner.id} className="flex flex-wrap items-center justify-between gap-2 border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                        <div>
                          <p className="text-sm font-bold">{["🥇", "🥈", "🥉"][winner.position - 1]} {winner.memberName}</p>
                          <p className="mt-0.5 text-[11px] text-white/45">{winner.period} · {winner.points} pts · Premio: {winner.prize}</p>
                        </div>
                        {winner.claimed_at ? (
                          <span className="border border-white/15 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white/40">Entregado</span>
                        ) : (
                          <button type="button" onClick={() => markDelivered(winner)} className="h-9 border border-emerald-400/30 bg-emerald-400/10 px-3 text-[10px] font-black uppercase tracking-wide text-emerald-300">
                            Marcar entregado
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={add} className="mt-6 border border-white/[0.08] bg-white/[0.02] p-5">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Agregar a la carta</p>

              <label className="mt-3 block">
                <span className={FIELD_LABEL}>Tipo</span>
                <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={FIELD_INPUT}>
                  {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                    <option key={k} value={k} className="bg-black">{KIND_LABEL[k]}</option>
                  ))}
                </select>
              </label>

              <div className="grid gap-x-4 sm:grid-cols-2">
                <label className="mt-3 block">
                  <span className={FIELD_LABEL}>Nombre *</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "premio" ? "Trago gratis" : kind === "combo" ? "Combo Fernet x2" : "Fernet con coca"} className={FIELD_INPUT} />
                </label>
                <label className="mt-3 block">
                  <span className={FIELD_LABEL}>Descripción</span>
                  <input value={description} onChange={(e) => setDescription(e.target.value)} className={FIELD_INPUT} />
                </label>
              </div>

              {kind === "premio" ? (
                <label className="mt-3 block">
                  <span className={FIELD_LABEL}>Puntos que cuesta *</span>
                  <input value={pointsCost} onChange={(e) => setPointsCost(e.target.value)} inputMode="numeric" className={FIELD_INPUT} />
                </label>
              ) : (
                <div className="grid gap-x-4 sm:grid-cols-2">
                  <label className="mt-3 block">
                    <span className={FIELD_LABEL}>Precio ($) *</span>
                    <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" className={FIELD_INPUT} />
                  </label>
                  <label className="mt-3 block">
                    <span className={FIELD_LABEL}>Puntos que suma cada unidad</span>
                    <input value={pointsEarned} onChange={(e) => setPointsEarned(e.target.value)} inputMode="numeric" placeholder="0" className={FIELD_INPUT} />
                  </label>
                </div>
              )}

              <button type="submit" disabled={saving} className="mt-4 h-12 w-full bg-[#ff2a1a] text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d] disabled:opacity-40 sm:w-auto sm:px-8">
                {saving ? "Guardando…" : "+ Agregar"}
              </button>
            </form>

            {items === null ? (
              <div className="mt-6 border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Cargando…</div>
            ) : (
              (["trago", "combo", "premio"] as Kind[]).map((k) => {
                const group = items.filter((i) => i.kind === k);
                if (group.length === 0) return null;
                return (
                  <div key={k} className="mt-8">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff7354]">{KIND_TITLE[k]}</h2>
                    <div className="mt-3 space-y-2">
                      {group.map((item) => (
                        <div key={item.id} className={`border border-white/[0.08] bg-white/[0.02] px-4 py-3 ${item.active ? "" : "opacity-50"}`}>
                          {editingId === item.id ? (
                            <div className="flex flex-wrap items-end gap-2">
                              <input value={edit.name} onChange={(e) => setEdit((d) => ({ ...d, name: e.target.value }))} className="h-10 min-w-[160px] flex-1 border border-white/[0.12] bg-black/30 px-3 text-sm outline-none focus:border-[#ff5a2a]/50" />
                              {item.kind === "premio" ? (
                                <input value={edit.pointsCost} onChange={(e) => setEdit((d) => ({ ...d, pointsCost: e.target.value }))} inputMode="numeric" placeholder="Puntos" className="h-10 w-24 border border-white/[0.12] bg-black/30 px-3 text-sm outline-none focus:border-[#ff5a2a]/50" />
                              ) : (
                                <>
                                  <input value={edit.price} onChange={(e) => setEdit((d) => ({ ...d, price: e.target.value }))} inputMode="numeric" placeholder="Precio" className="h-10 w-24 border border-white/[0.12] bg-black/30 px-3 text-sm outline-none focus:border-[#ff5a2a]/50" />
                                  <input value={edit.pointsEarned} onChange={(e) => setEdit((d) => ({ ...d, pointsEarned: e.target.value }))} inputMode="numeric" placeholder="Pts" className="h-10 w-20 border border-white/[0.12] bg-black/30 px-3 text-sm outline-none focus:border-[#ff5a2a]/50" />
                                </>
                              )}
                              <button type="button" onClick={() => saveEdit(item)} className="h-10 border border-emerald-400/30 bg-emerald-400/10 px-3 text-[10px] font-black uppercase tracking-wide text-emerald-300">Guardar</button>
                              <button type="button" onClick={() => setEditingId(null)} className="h-10 border border-white/15 px-3 text-[10px] font-black uppercase tracking-wide text-white/50">Cancelar</button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-bold">{item.name}{!item.active && <span className="ml-2 text-[9px] font-black uppercase text-white/40">Oculto</span>}</p>
                                <p className="mt-0.5 text-[11px] text-white/40">
                                  {item.kind === "premio" ? `${item.points_cost} puntos` : `${formatMoney(item.price_minor)} · suma ${item.points_earned} pts`}
                                  {item.description ? ` · ${item.description}` : ""}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => startEdit(item)} className="h-8 border border-white/15 px-3 text-[9px] font-black uppercase tracking-wide text-white/60 hover:text-white">Editar</button>
                                <button type="button" onClick={() => toggleActive(item)} className="h-8 border border-white/15 px-3 text-[9px] font-black uppercase tracking-wide text-white/60 hover:text-white">{item.active ? "Ocultar" : "Mostrar"}</button>
                                <button type="button" onClick={() => remove(item)} className="h-8 border border-red-400/20 px-3 text-[9px] font-black uppercase tracking-wide text-red-300/70 hover:text-red-300">Quitar</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </section>
    </main>
  );
}
