"use client";

import { FormEvent, useEffect, useState } from "react";
import { FIELD_INPUT, FIELD_LABEL } from "../membresia-nav";
import { useNow } from "../../../_components/use-now";

type Level = { id: string; name: string; min_points: number; discount_percent: number; perk: string | null };
type Boost = { id: string; name: string; multiplier: number; starts_at: string; ends_at: string; active: boolean };

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));
}

// Niveles de socio (descuento automatico segun puntos ganados) y puntos dobles
// por fecha. Cada bloque carga y guarda por su cuenta.
export default function CartaExtras({ onError }: { onError: (message: string) => void }) {
  const [levels, setLevels] = useState<Level[] | null>(null);
  const [boosts, setBoosts] = useState<Boost[] | null>(null);

  const [levelName, setLevelName] = useState("");
  const [levelPoints, setLevelPoints] = useState("");
  const [levelDiscount, setLevelDiscount] = useState("");
  const [levelPerk, setLevelPerk] = useState("");
  const [savingLevel, setSavingLevel] = useState(false);

  const [boostName, setBoostName] = useState("");
  const [boostMultiplier, setBoostMultiplier] = useState("2");
  const [boostFrom, setBoostFrom] = useState("");
  const [boostTo, setBoostTo] = useState("");
  const [savingBoost, setSavingBoost] = useState(false);

  async function loadAll() {
    try {
      const [l, b] = await Promise.all([fetch("/api/panel/membresia-niveles", { cache: "no-store" }), fetch("/api/panel/membresia-boosts", { cache: "no-store" })]);
      const lj = await l.json();
      const bj = await b.json();
      if (l.ok) setLevels(lj.levels);
      else onError(lj.error ?? "No se pudieron cargar los niveles.");
      if (b.ok) setBoosts(bj.boosts);
      else onError(bj.error ?? "No se pudieron cargar los puntos dobles.");
    } catch {
      onError("No se pudieron cargar los niveles y puntos dobles.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function call(url: string, method: string, body?: unknown) {
    const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");
    return result;
  }

  async function addLevel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (savingLevel) return;
    setSavingLevel(true);
    onError("");
    try {
      const result = await call("/api/panel/membresia-niveles", "POST", { name: levelName, minPoints: levelPoints, discountPercent: levelDiscount || 0, perk: levelPerk });
      setLevels((prev) => [...(prev ?? []), result.level].sort((a, b) => a.min_points - b.min_points));
      setLevelName("");
      setLevelPoints("");
      setLevelDiscount("");
      setLevelPerk("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSavingLevel(false);
    }
  }

  async function removeLevel(level: Level) {
    if (!window.confirm(`¿Quitar el nivel "${level.name}"?`)) return;
    onError("");
    try {
      await call(`/api/panel/membresia-niveles?id=${level.id}`, "DELETE");
      setLevels((prev) => (prev ?? []).filter((l) => l.id !== level.id));
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo borrar.");
    }
  }

  async function addBoost(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (savingBoost) return;
    setSavingBoost(true);
    onError("");
    try {
      const result = await call("/api/panel/membresia-boosts", "POST", {
        name: boostName,
        multiplier: boostMultiplier,
        startsAt: boostFrom ? new Date(boostFrom).toISOString() : "",
        endsAt: boostTo ? new Date(boostTo).toISOString() : "",
      });
      setBoosts((prev) => [result.boost, ...(prev ?? [])]);
      setBoostName("");
      setBoostFrom("");
      setBoostTo("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSavingBoost(false);
    }
  }

  async function toggleBoost(boost: Boost) {
    onError("");
    try {
      const result = await call("/api/panel/membresia-boosts", "PATCH", { id: boost.id, active: !boost.active });
      setBoosts((prev) => (prev ?? []).map((b) => (b.id === boost.id ? result.boost : b)));
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  async function removeBoost(boost: Boost) {
    if (!window.confirm(`¿Borrar "${boost.name}"?`)) return;
    onError("");
    try {
      await call(`/api/panel/membresia-boosts?id=${boost.id}`, "DELETE");
      setBoosts((prev) => (prev ?? []).filter((b) => b.id !== boost.id));
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo borrar.");
    }
  }

  const now = useNow();

  return (
    <>
      <div className="mt-6 border border-white/[0.08] bg-white/[0.02] p-5">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Niveles de socio</p>
        <p className="mt-1 max-w-xl text-xs text-white/35">
          Según los puntos que un socio ganó en total (canjear no lo baja de nivel), pasa de nivel y recibe un descuento automático en tragos y combos.
        </p>

        {(levels ?? []).length > 0 && (
          <div className="mt-4 space-y-2">
            {(levels ?? []).map((level) => (
              <div key={level.id} className="flex flex-wrap items-center justify-between gap-2 border border-white/[0.08] px-4 py-3">
                <div>
                  <p className="text-sm font-bold">{level.name}</p>
                  <p className="mt-0.5 text-[11px] text-white/40">
                    Desde {level.min_points} puntos · {level.discount_percent > 0 ? `${level.discount_percent}% de descuento` : "sin descuento"}
                    {level.perk ? ` · ${level.perk}` : ""}
                  </p>
                </div>
                <button type="button" onClick={() => removeLevel(level)} className="h-8 border border-red-400/20 px-3 text-[9px] font-black uppercase tracking-wide text-red-300/70 hover:text-red-300">Quitar</button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={addLevel} className="mt-4">
          <div className="grid gap-x-4 sm:grid-cols-3">
            <label className="mt-2 block">
              <span className={FIELD_LABEL}>Nombre *</span>
              <input value={levelName} onChange={(e) => setLevelName(e.target.value)} placeholder="Plata" className={FIELD_INPUT} />
            </label>
            <label className="mt-2 block">
              <span className={FIELD_LABEL}>Desde (puntos) *</span>
              <input value={levelPoints} onChange={(e) => setLevelPoints(e.target.value)} inputMode="numeric" placeholder="500" className={FIELD_INPUT} />
            </label>
            <label className="mt-2 block">
              <span className={FIELD_LABEL}>Descuento (%)</span>
              <input value={levelDiscount} onChange={(e) => setLevelDiscount(e.target.value)} inputMode="numeric" placeholder="10" className={FIELD_INPUT} />
            </label>
          </div>
          <label className="mt-2 block">
            <span className={FIELD_LABEL}>Beneficio (texto que ve el socio)</span>
            <input value={levelPerk} onChange={(e) => setLevelPerk(e.target.value)} placeholder="Entrada preferencial" className={FIELD_INPUT} />
          </label>
          <button type="submit" disabled={savingLevel} className="mt-3 h-11 bg-[#ff2a1a] px-6 text-[10px] font-black uppercase tracking-[0.16em] text-white disabled:opacity-40">
            {savingLevel ? "Guardando…" : "+ Agregar nivel"}
          </button>
        </form>
      </div>

      <div className="mt-6 border border-white/[0.08] bg-white/[0.02] p-5">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Puntos dobles</p>
        <p className="mt-1 max-w-xl text-xs text-white/35">
          Programá una fecha en la que los pedidos suman más puntos (por ejemplo, doble puntos el sábado). Se aplica solo a los pedidos hechos en ese horario.
        </p>

        {(boosts ?? []).length > 0 && (
          <div className="mt-4 space-y-2">
            {(boosts ?? []).map((boost) => {
              const live = boost.active && new Date(boost.starts_at).getTime() <= now && now < new Date(boost.ends_at).getTime();
              const finished = now !== 0 && new Date(boost.ends_at).getTime() <= now;
              return (
                <div key={boost.id} className={`flex flex-wrap items-center justify-between gap-2 border border-white/[0.08] px-4 py-3 ${boost.active && !finished ? "" : "opacity-50"}`}>
                  <div>
                    <p className="text-sm font-bold">
                      {boost.name} <span className="text-amber-300">x{boost.multiplier}</span>
                      {live && <span className="ml-2 border border-emerald-400/30 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-300">En curso</span>}
                      {finished && <span className="ml-2 text-[9px] font-black uppercase text-white/40">Terminó</span>}
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/40">{formatDateTime(boost.starts_at)} a {formatDateTime(boost.ends_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    {!finished && (
                      <button type="button" onClick={() => toggleBoost(boost)} className="h-8 border border-white/15 px-3 text-[9px] font-black uppercase tracking-wide text-white/60 hover:text-white">
                        {boost.active ? "Pausar" : "Activar"}
                      </button>
                    )}
                    <button type="button" onClick={() => removeBoost(boost)} className="h-8 border border-red-400/20 px-3 text-[9px] font-black uppercase tracking-wide text-red-300/70 hover:text-red-300">Borrar</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <form onSubmit={addBoost} className="mt-4">
          <div className="grid gap-x-4 sm:grid-cols-2">
            <label className="mt-2 block">
              <span className={FIELD_LABEL}>Nombre *</span>
              <input value={boostName} onChange={(e) => setBoostName(e.target.value)} placeholder="Doble puntos del sábado" className={FIELD_INPUT} />
            </label>
            <label className="mt-2 block">
              <span className={FIELD_LABEL}>Multiplicador *</span>
              <select value={boostMultiplier} onChange={(e) => setBoostMultiplier(e.target.value)} className={FIELD_INPUT}>
                {["1.5", "2", "3", "5"].map((m) => (
                  <option key={m} value={m} className="bg-black">x{m}</option>
                ))}
              </select>
            </label>
            <label className="mt-2 block">
              <span className={FIELD_LABEL}>Desde *</span>
              <input type="datetime-local" value={boostFrom} onChange={(e) => setBoostFrom(e.target.value)} className={FIELD_INPUT} />
            </label>
            <label className="mt-2 block">
              <span className={FIELD_LABEL}>Hasta *</span>
              <input type="datetime-local" value={boostTo} onChange={(e) => setBoostTo(e.target.value)} className={FIELD_INPUT} />
            </label>
          </div>
          <button type="submit" disabled={savingBoost} className="mt-3 h-11 bg-[#ff2a1a] px-6 text-[10px] font-black uppercase tracking-[0.16em] text-white disabled:opacity-40">
            {savingBoost ? "Guardando…" : "+ Programar puntos dobles"}
          </button>
        </form>
      </div>
    </>
  );
}
