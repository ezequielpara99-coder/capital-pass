"use client";

import { useCallback, useEffect, useState } from "react";
import { MembresiaHeader, formatMoney } from "../membresia-nav";

type OrderItem = { name: string; qty: number };
type Order = {
  id: string; kind: "consumo" | "mesa"; items: OrderItem[]; total_minor: number; points_earned: number; points_cost: number;
  payment: "wallet" | "en_barra"; delivery: string | null; note: string | null; status: "pending" | "ready" | "delivered" | "cancelled";
  pickup_code: string; created_at: string; memberName: string;
};

const STATUS_LABEL: Record<Order["status"], string> = { pending: "Nuevo", ready: "Listo", delivered: "Entregado", cancelled: "Cancelado" };
const STATUS_STYLE: Record<Order["status"], string> = {
  pending: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  ready: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  delivered: "border-white/15 text-white/50",
  cancelled: "border-red-400/25 text-red-300",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));
}

// embedded: se usa dentro de otra pantalla (la del bartender), sin marco ni encabezado.
export default function PedidosClient({ embedded = false }: { embedded?: boolean }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [scope, setScope] = useState<"open" | "all">("open");
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/panel/membresia-pedidos?scope=${scope}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 403 || response.status === 503) setBlocked(result.error);
        throw new Error(result.error ?? "No se pudo cargar.");
      }
      setOrders(result.orders);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
    }
  }, [scope]);

  // La cola se actualiza sola: el bartender la deja abierta en la barra.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const timer = setInterval(() => { load(); }, 10000);
    return () => clearInterval(timer);
  }, [load]);

  async function setStatus(order: Order, status: "ready" | "delivered" | "cancelled") {
    if (busyId) return;
    if (status === "cancelled" && !window.confirm("¿Cancelar el pedido? Se le devuelve el saldo y los puntos al socio.")) return;
    setBusyId(order.id);
    setError("");
    try {
      const response = await fetch("/api/panel/membresia-pedidos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    } finally {
      setBusyId(null);
    }
  }

  const renderShell = (children: React.ReactNode) =>
    embedded ? (
      <div className="text-[#f7f3ed]">{children}</div>
    ) : (
      <main className="relative min-h-screen bg-[#050505] text-[#f7f3ed]">
        <section className="mx-auto w-full max-w-[900px] px-5 py-8 md:px-8">
          <MembresiaHeader active="pedidos" title="Pedidos." subtitle="Lo que piden tus socios desde su app. Se actualiza solo cada 10 segundos." />
          {children}
        </section>
      </main>
    );

  return renderShell(
      <>
        {blocked && <div className="mt-6 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">{blocked}</div>}
        {error && !blocked && <div className="mt-6 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {!blocked && (
          <>
            <div className="mt-6 flex gap-2">
              {(["open", "all"] as const).map((s) => (
                <button key={s} type="button" onClick={() => { setOrders(null); setScope(s); }} className={`h-10 border px-4 text-[10px] font-black uppercase tracking-[0.14em] ${scope === s ? "border-[#ff5a2a]/60 bg-[#ff5a2a]/10 text-white" : "border-white/[0.10] text-white/45"}`}>
                  {s === "open" ? "En curso" : "Historial"}
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-3">
              {orders === null ? (
                <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">Cargando…</div>
              ) : orders.length === 0 ? (
                <div className="border border-dashed border-white/[0.10] p-8 text-center text-sm text-white/35">{scope === "open" ? "No hay pedidos en curso." : "Todavía no hay pedidos."}</div>
              ) : (
                orders.map((order) => (
                  <div key={order.id} className={`border px-4 py-4 ${order.status === "pending" ? "border-amber-400/30 bg-amber-400/[0.04]" : "border-white/[0.08] bg-white/[0.02]"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-2xl font-black tracking-[0.18em]">{order.pickup_code}</span>
                        <span className={`border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${STATUS_STYLE[order.status]}`}>{STATUS_LABEL[order.status]}</span>
                        {order.kind === "mesa" && <span className="border border-violet-400/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-violet-300">Reserva de mesa</span>}
                      </div>
                      <span className="text-[11px] text-white/35">{formatTime(order.created_at)}</span>
                    </div>

                    <p className="mt-2 text-sm font-bold">{order.memberName}</p>
                    <ul className="mt-1 text-sm text-white/80">
                      {order.items.map((item, index) => <li key={index}>{item.qty} × {item.name}</li>)}
                    </ul>
                    {order.delivery && <p className="mt-2 inline-block border border-white/15 px-2 py-1 text-xs font-black">{order.delivery}</p>}
                    {order.note && <p className="mt-2 text-xs text-white/50">“{order.note}”</p>}
                    <p className="mt-2 text-[11px] text-white/40">
                      {order.total_minor > 0 ? `${formatMoney(order.total_minor)} · ${order.payment === "wallet" ? "PAGADO con saldo" : "COBRAR al entregar"}` : ""}
                      {order.points_cost > 0 ? ` ${order.total_minor > 0 ? "· " : ""}canje de ${order.points_cost} pts` : ""}
                      {order.points_earned > 0 ? ` · suma ${order.points_earned} pts` : ""}
                    </p>

                    {(order.status === "pending" || order.status === "ready") && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {order.status === "pending" && (
                          <button type="button" disabled={busyId === order.id} onClick={() => setStatus(order, "ready")} className="h-10 border border-emerald-400/30 bg-emerald-400/10 px-4 text-[10px] font-black uppercase tracking-wide text-emerald-300 disabled:opacity-40">Marcar listo</button>
                        )}
                        <button type="button" disabled={busyId === order.id} onClick={() => setStatus(order, "delivered")} className="h-10 bg-[#ff2a1a] px-4 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-40">Entregado</button>
                        <button type="button" disabled={busyId === order.id} onClick={() => setStatus(order, "cancelled")} className="h-10 border border-red-400/25 px-4 text-[10px] font-black uppercase tracking-wide text-red-300/80 disabled:opacity-40">Cancelar</button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </>
  );
}
