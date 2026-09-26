"use client";

import Link from "next/link";
import { FormEvent, useMemo, useEffect, useState } from "react";
import { createClient } from "../../../lib/supabase/client";

type Member = {
  id: string;
  first_name: string;
  last_name: string;
  dni: string | null;
  phone: string | null;
  email: string | null;
  member_code: string;
  status: "active" | "expired" | "cancelled";
  starts_at: string;
  expires_at: string | null;
  notes: string | null;
  balance_minor: number;
  cardUrl: string;
};

function formatMoney(minor: number) {
  return `$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(minor)}`;
}

const INPUT =
  "mt-2 h-12 w-full border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/50";
const LABEL = "block text-[9px] font-black uppercase tracking-[0.18em] text-white/40";
const STATUS_LABEL: Record<Member["status"], string> = { active: "Activo", expired: "Vencido", cancelled: "Cancelado" };
const STATUS_STYLE: Record<Member["status"], string> = {
  active: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  expired: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  cancelled: "border-red-400/30 bg-red-400/10 text-red-300",
};

function emptyDraft() {
  return { firstName: "", lastName: "", dni: "", phone: "", email: "", expiresAt: "", notes: "" };
}

function formatDate(value: string | null) {
  if (!value) return "Sin vencimiento";
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export default function MembresiaClient() {
  const supabase = useMemo(() => createClient(), []);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [missingSql, setMissingSql] = useState(false);
  const [notEnabled, setNotEnabled] = useState(false);
  const [walletOpenId, setWalletOpenId] = useState<string | null>(null);
  const [walletAmount, setWalletAmount] = useState("");
  const [walletNote, setWalletNote] = useState("");
  const [walletBusy, setWalletBusy] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/panel/membresia-premium");
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 503) setMissingSql(true);
        if (response.status === 403) setNotEnabled(true);
        throw new Error(result.error ?? "No se pudo cargar.");
      }
      setMembers(result.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/panel/membresia-premium", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo agregar.");
      setMembers((prev) => [result.member, ...(prev ?? [])]);
      setDraft(emptyDraft());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(member: Member, status: Member["status"]) {
    setError("");
    try {
      const response = await fetch("/api/panel/membresia-premium", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: member.id, status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar.");
      setMembers((prev) => (prev ?? []).map((m) => (m.id === member.id ? result.member : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    }
  }

  async function remove(member: Member) {
    if (!window.confirm(`¿Borrar a "${member.first_name} ${member.last_name}" del padrón?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/panel/membresia-premium?id=${member.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo borrar.");
      setMembers((prev) => (prev ?? []).filter((m) => m.id !== member.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    }
  }

  function openWallet(member: Member) {
    setWalletOpenId(walletOpenId === member.id ? null : member.id);
    setWalletAmount("");
    setWalletNote("");
    setError("");
  }

  async function moveWallet(member: Member, kind: "topup" | "spend") {
    if (walletBusy) return;
    const amount = Math.round(Number(walletAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Ingresá un monto válido.");
      return;
    }
    setWalletBusy(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("wallet_move", {
        p_member_id: member.id,
        p_amount_minor: kind === "spend" ? -amount : amount,
        p_kind: kind,
        p_note: walletNote.trim() || null,
      });
      if (rpcError) throw rpcError;
      const newBalance = Number((data ?? [])[0]?.new_balance_minor ?? member.balance_minor);
      setMembers((prev) => (prev ?? []).map((m) => (m.id === member.id ? { ...m, balance_minor: newBalance } : m)));
      setWalletOpenId(null);
      setWalletAmount("");
      setWalletNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el movimiento.");
    } finally {
      setWalletBusy(false);
    }
  }

  const visible = (members ?? []).filter((m) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return `${m.first_name} ${m.last_name} ${m.member_code} ${m.dni ?? ""}`.toLowerCase().includes(term);
  });

  return (
    <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
      <section className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
        <header className="border-b border-white/[0.07] pb-8">
          <Link href="/panel" className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ← Panel
          </Link>
          <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">Capital Pass</p>
          <h1 className="mt-3 text-[clamp(32px,5vw,56px)] font-black uppercase leading-[0.95] tracking-[-0.04em]">Membresía premium.</h1>
          <p className="mt-3 max-w-xl text-sm text-white/45">Tu padrón de socios premium, con código propio, válido en todos tus eventos.</p>
        </header>

        {notEnabled && (
          <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Este addon todavía no está habilitado para tu cuenta. Contactá a Capital Pass para activarlo.
          </div>
        )}
        {missingSql && (
          <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Falta aplicar la actualización de la base de datos de membresía premium (20260972).
          </div>
        )}
        {error && !notEnabled && !missingSql && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {!notEnabled && !missingSql && (
          <>
            <form onSubmit={submit} className="mt-8 border border-white/[0.08] bg-white/[0.02] p-5">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Nuevo socio</p>

              <div className="grid gap-x-4 sm:grid-cols-2">
                <label className="mt-3 block">
                  <span className={LABEL}>Nombre *</span>
                  <input value={draft.firstName} onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))} className={INPUT} />
                </label>
                <label className="mt-3 block">
                  <span className={LABEL}>Apellido *</span>
                  <input value={draft.lastName} onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))} className={INPUT} />
                </label>
              </div>

              <div className="grid gap-x-4 sm:grid-cols-2">
                <label className="mt-3 block">
                  <span className={LABEL}>DNI</span>
                  <input value={draft.dni} onChange={(e) => setDraft((d) => ({ ...d, dni: e.target.value }))} inputMode="numeric" className={INPUT} />
                </label>
                <label className="mt-3 block">
                  <span className={LABEL}>Teléfono</span>
                  <input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} inputMode="tel" className={INPUT} />
                </label>
              </div>

              <div className="grid gap-x-4 sm:grid-cols-2">
                <label className="mt-3 block">
                  <span className={LABEL}>Email</span>
                  <input value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} inputMode="email" className={INPUT} />
                </label>
                <label className="mt-3 block">
                  <span className={LABEL}>Vence (vacío = sin vencimiento)</span>
                  <input type="date" value={draft.expiresAt} onChange={(e) => setDraft((d) => ({ ...d, expiresAt: e.target.value }))} className={INPUT} />
                </label>
              </div>

              <label className="mt-3 block">
                <span className={LABEL}>Notas</span>
                <input value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} className={INPUT} />
              </label>

              <button type="submit" disabled={saving} className="mt-4 h-12 w-full bg-[#ff2a1a] text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#ff4a2d] disabled:opacity-40 sm:w-auto sm:px-8">
                {saving ? "Guardando…" : "+ Agregar socio"}
              </button>
            </form>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, código o DNI…"
              className="mt-6 h-11 w-full border border-white/[0.12] bg-black/30 px-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#ff5a2a]/50"
            />

            <div className="mt-6 space-y-2">
              {members === null ? (
                <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Cargando…</div>
              ) : visible.length === 0 ? (
                <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">
                  {members.length === 0 ? "Todavía no hay socios cargados." : "Ningún socio coincide con la búsqueda."}
                </div>
              ) : (
                visible.map((member) => (
                  <div key={member.id} className="border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold">
                          {member.first_name} {member.last_name}{" "}
                          <span className={`ml-1 border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${STATUS_STYLE[member.status]}`}>
                            {STATUS_LABEL[member.status]}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-white/35">
                          Código <span className="font-mono text-white/60">{member.member_code}</span>
                          {member.dni ? ` · DNI ${member.dni}` : ""}
                          {member.phone ? ` · ${member.phone}` : ""}
                          {" · "}
                          {formatDate(member.expires_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => openWallet(member)} className="h-8 border border-emerald-400/25 px-3 text-[9px] font-black uppercase tracking-wide text-emerald-300 hover:bg-emerald-400/10">
                          Saldo: {formatMoney(member.balance_minor)}
                        </button>
                        <a href={member.cardUrl} target="_blank" rel="noopener noreferrer" className="h-8 border border-violet-400/25 px-3 text-[9px] font-black uppercase tracking-wide text-violet-300 hover:bg-violet-400/10">
                          Ver carnet
                        </a>
                        {member.status !== "active" && (
                          <button type="button" onClick={() => setStatus(member, "active")} className="h-8 border border-emerald-400/25 px-3 text-[9px] font-black uppercase tracking-wide text-emerald-300 hover:bg-emerald-400/10">
                            Reactivar
                          </button>
                        )}
                        {member.status === "active" && (
                          <button type="button" onClick={() => setStatus(member, "cancelled")} className="h-8 border border-white/15 px-3 text-[9px] font-black uppercase tracking-wide text-white/60 hover:border-white/40 hover:text-white">
                            Cancelar
                          </button>
                        )}
                        <button type="button" onClick={() => remove(member)} className="h-8 border border-red-400/20 px-3 text-[9px] font-black uppercase tracking-wide text-red-300/70 hover:text-red-300">
                          Quitar
                        </button>
                      </div>
                    </div>

                    {walletOpenId === member.id && (
                      <div className="mt-3 border-t border-white/[0.06] pt-3">
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="block">
                            <span className={LABEL}>Monto</span>
                            <input
                              value={walletAmount}
                              onChange={(e) => setWalletAmount(e.target.value)}
                              inputMode="numeric"
                              placeholder="0"
                              className="mt-2 h-11 w-32 border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50"
                            />
                          </label>
                          <label className="block flex-1 min-w-[160px]">
                            <span className={LABEL}>Nota</span>
                            <input
                              value={walletNote}
                              onChange={(e) => setWalletNote(e.target.value)}
                              placeholder="Carga en puerta, consumo barra…"
                              className="mt-2 h-11 w-full border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-[#ff5a2a]/50"
                            />
                          </label>
                          <button type="button" disabled={walletBusy} onClick={() => moveWallet(member, "topup")} className="h-11 border border-emerald-400/30 bg-emerald-400/10 px-4 text-[10px] font-black uppercase tracking-wide text-emerald-300 hover:bg-emerald-400/20 disabled:opacity-40">
                            + Cargar
                          </button>
                          <button type="button" disabled={walletBusy} onClick={() => moveWallet(member, "spend")} className="h-11 border border-amber-400/30 bg-amber-400/10 px-4 text-[10px] font-black uppercase tracking-wide text-amber-300 hover:bg-amber-400/20 disabled:opacity-40">
                            − Consumo
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
