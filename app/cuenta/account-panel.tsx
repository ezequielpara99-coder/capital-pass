"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Plan = { id: string; name: string; price_minor: number; currency: string; billing_interval: string };
type Account = { active: boolean; destination: string; organizationName: string; canManage: boolean; isAdmin: boolean; email: string; hasSignup: boolean; mpStatus: string | null; periodEnd: string | null; lastPlanId: string | null };

export default function AccountPanel({ initial, plans, returning }: { initial: Account; plans: Plan[]; returning: boolean }) {
  const [account, setAccount] = useState(initial);
  // Si la organizacion ya eligio un plan antes (incluye un upgrade pagado
  // en el periodo vigente), lo recordamos para la renovacion en vez de
  // arrancar siempre desde el plan mas barato.
  const preferredPlanId = initial.lastPlanId && plans.some((p) => p.id === initial.lastPlanId) ? initial.lastPlanId : plans[0]?.id ?? "";
  const [planId, setPlanId] = useState(preferredPlanId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const checking = useRef(false);
  const activeRef = useRef(initial.active);
  const plan = plans.find((p) => p.id === planId);

  const verify = useCallback(async (signal?: AbortSignal) => {
    if (checking.current) return;
    checking.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/cuenta/verificar-pago", { method: "POST", signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No pudimos verificar el pago.");
      activeRef.current = result.active;
      setAccount((previous) => ({ ...previous, active: result.active, destination: result.destination, mpStatus: result.mpStatus }));
      setMessage(result.active ? "Tu servicio está activo." : "La confirmación del cobro sigue pendiente. No hace falta iniciar otra compra.");
      if (result.active && returning) window.location.replace(result.destination);
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "No pudimos verificar el pago.");
    } finally { checking.current = false; setBusy(false); }
  }, [returning]);

  useEffect(() => {
    if (initial.isAdmin || initial.active || (!initial.hasSignup && !returning)) return;
    const controller = new AbortController();
    let attempts = 0;
    const run = () => { attempts++; void verify(controller.signal); };
    const start = window.setTimeout(run, 0);
    const interval = window.setInterval(() => {
      if (activeRef.current || attempts >= 6) { window.clearInterval(interval); return; }
      run();
    }, 10000);
    return () => { controller.abort(); window.clearTimeout(start); window.clearInterval(interval); };
  }, [initial.active, initial.hasSignup, initial.isAdmin, returning, verify]);

  async function checkout() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/mercadopago/suscripcion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "No pudimos iniciar la suscripción.");
      window.location.assign(result.checkoutUrl);
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos iniciar la suscripción."); setBusy(false); }
  }

  return <main className="relative min-h-screen overflow-hidden bg-[#050505] px-5 py-6 text-[#f7f3ed] selection:bg-[#ff3b24] selection:text-white md:px-8 xl:px-10">
    {/* FONDO — luz neutra centrada, punto de llegada del recorrido */}
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-1/2 top-[-320px] h-[680px] w-[900px] -translate-x-1/2 rounded-full bg-[#ff2a1a]/[0.09] blur-[190px]" />
      <div className="absolute inset-0 opacity-[0.033] [background-image:radial-gradient(rgba(255,255,255,.9)_0.6px,transparent_0.8px)] [background-size:5px_5px]" />
    </div>

    <div className="relative z-10 mx-auto w-full max-w-[1480px]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="relative h-9 w-9 border border-white/[0.10] bg-white/[0.03]">
            <div className="absolute inset-[4px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_18px_rgba(255,59,36,.2)]" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-[0.3em]">Capital Pass</span>
        </Link>
        <Link href="/logout" className="text-xs font-bold uppercase tracking-[0.16em] text-white/50 underline transition hover:text-white">Cerrar sesión</Link>
      </header>

      <div className="mx-auto mt-14 w-full max-w-[620px]">
        <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#f7f3ed]/35">Tu cuenta</p>
        <h1 className="mt-4 text-[clamp(38px,7vw,56px)] font-black uppercase leading-[0.86] tracking-[-0.05em]">{account.organizationName}</h1>
        <p className="mt-2 break-all text-sm text-white/45">{account.email}</p>

        <section className="mt-10 border border-white/[0.09] bg-[#080706]/90 p-7 shadow-[0_30px_120px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-2xl sm:p-9">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#ff7958]">{account.active ? "Servicio activo" : "Servicio bloqueado"}</p>
          <h2 className="mt-3 text-2xl font-black uppercase tracking-[-0.03em]">{account.active ? "Todo listo para trabajar" : "Activá tu suscripción"}</h2>
          {account.active && account.periodEnd && !account.isAdmin && <p className="mt-3 text-sm leading-6 text-white/50">Tu suscripción vence el {new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(account.periodEnd))}. Te avisamos por email antes de esa fecha.</p>}
          {account.active ? <Link href={account.destination} className="cp-punch mt-7 inline-flex h-14 items-center bg-[#ff3b24] px-6 text-[11px] font-black uppercase tracking-[0.24em] text-white shadow-[0_18px_50px_rgba(255,59,36,.3)] transition hover:scale-[1.02] hover:bg-[#ff4a32] active:scale-[0.99]">{account.isAdmin ? "Entrar al administrador" : "Entrar a mi panel"}</Link>
            : !account.canManage ? <p className="mt-4 text-sm leading-6 text-white/60">El organizador debe activar el servicio para habilitar tu acceso. Si tu cuenta fue deshabilitada, contactalo.</p>
            : <>
              <p className="mt-3 text-sm leading-7 text-white/50">Tu cuenta está creada. El servicio se habilita cuando se confirma el pago.</p>
              {plans.length > 1 && <label className="mt-6 block text-[10px] font-black uppercase tracking-[0.26em] text-[#f7f3ed]/55">Plan
                <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="mt-3 block h-14 w-full border border-white/[0.10] bg-black/25 px-4 text-sm font-semibold outline-none focus:border-[#ff3b24]/70">{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </label>}
              {plan && <div className="mt-7 border-t border-white/[0.08] pt-6"><p className="text-sm font-bold text-white/70">{plan.name}</p><p className="mt-2 text-4xl font-black tracking-[-0.04em]">{new Intl.NumberFormat("es-AR", { style: "currency", currency: plan.currency, maximumFractionDigits: 0 }).format(Number(plan.price_minor))}<span className="ml-2 text-sm font-normal text-white/40">/ {plan.billing_interval === "yearly" ? "año" : "mes"}</span></p></div>}
              {plan ? <button onClick={checkout} disabled={busy} className="cp-punch mt-7 h-14 w-full bg-[#ff3b24] px-6 text-[11px] font-black uppercase tracking-[0.24em] text-white shadow-[0_18px_50px_rgba(255,59,36,.3)] transition hover:scale-[1.01] hover:bg-[#ff4a32] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45">{busy ? "Procesando..." : account.hasSignup && account.mpStatus === "pending" ? "Continuar en Mercado Pago" : "Activar suscripción"}</button>
                : <p className="mt-5 text-sm text-white/50">No hay planes disponibles en este momento.</p>}
            </>}
        </section>

        {!account.isAdmin && (account.active
          ? <div className="mt-6 border border-emerald-400/25 bg-emerald-500/[0.06] p-6">
              <span className="inline-flex h-12 items-center gap-2 border border-emerald-400/30 bg-emerald-500/10 px-5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">✓ Pago verificado</span>
            </div>
          : <div className="mt-6 border border-white/[0.08] bg-white/[0.02] p-6">
              <button disabled={busy} onClick={() => void verify()} className="h-12 border border-white/20 px-5 text-[10px] font-black uppercase tracking-[0.2em] transition hover:border-white/40 disabled:opacity-50">{busy ? "Verificando..." : "Verificar mi pago"}</button>
              <p className="mt-3 text-sm leading-6 text-white/45">Si ya pagaste, podés comprobarlo acá sin volver a comprar.</p>
            </div>)}

        {message && <p role="status" className="mt-5 text-sm text-white/70">{message}</p>}
        {error && <p role="alert" className="mt-5 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">{error}</p>}
      </div>
    </div>
  </main>;
}
