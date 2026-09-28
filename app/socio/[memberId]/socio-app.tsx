"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ColectivoTracker from "../../_components/colectivo-tracker";

type MenuItem = { id: string; kind: "trago" | "combo" | "premio"; name: string; description: string | null; price_minor: number; points_earned: number; points_cost: number | null };
type Table = { id: string; event_id: string; name: string; capacity: number | null; price_minor: number | null };
type EventRow = { id: string; name: string; starts_at: string | null; status: string; tables: Table[] };
type OrderItem = { name: string; kind: string; qty: number; price_minor: number };
type Order = {
  id: string; kind: "consumo" | "mesa"; items: OrderItem[]; total_minor: number; points_cost: number; points_earned: number;
  payment: "wallet" | "en_barra"; delivery: string | null; status: "pending" | "ready" | "delivered" | "cancelled"; pickup_code: string; created_at: string;
};
type PointsRow = { id: string; delta: number; reason: string; created_at: string };
type AppData = {
  member: { firstName: string; lastName: string; code: string; status: string; expiresAt: string | null; balanceMinor: number; pointsBalance: number };
  organization: { name: string; checkinPoints: number; topupsEnabled: boolean };
  menu: MenuItem[];
  events: EventRow[];
  orders: Order[];
  points: PointsRow[];
  wonPrizes: WonPrize[];
};

type Props = { memberId: string; signature: string; qrDataUrl: string };
type Tab = "carnet" | "carta" | "mesas" | "pedidos" | "puntos" | "ranking";
type WonPrize = { id: string; period: string; position: number; prize: string; claimed_at: string | null };
type LastWinner = { period: string; position: number; name: string; prize: string };
type RankingData = {
  enabled: boolean;
  prizes: { position: number; prize: string }[];
  participants: number;
  top: { position: number; name: string; points: number; isMe: boolean }[];
  me: { position: number; points: number } | null;
};

const TABS: { id: Tab; label: string }[] = [
  { id: "carnet", label: "Carnet" },
  { id: "carta", label: "Carta" },
  { id: "mesas", label: "Mesas" },
  { id: "pedidos", label: "Pedidos" },
  { id: "puntos", label: "Puntos" },
  { id: "ranking", label: "Ranking" },
];

const MEDALS = ["🥇", "🥈", "🥉"];

const STATUS_LABEL: Record<Order["status"], string> = { pending: "Preparando", ready: "Listo", delivered: "Entregado", cancelled: "Cancelado" };
const STATUS_STYLE: Record<Order["status"], string> = {
  pending: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  ready: "border-emerald-400/40 bg-emerald-400/15 text-emerald-300",
  delivered: "border-white/15 bg-white/[0.04] text-white/50",
  cancelled: "border-red-400/25 bg-red-400/10 text-red-300",
};
const KIND_TITLE: Record<MenuItem["kind"], string> = { trago: "Tragos", combo: "Combos", premio: "Premios con puntos" };

function money(minor: number) {
  return `$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(minor)}`;
}

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));
}

function monthName(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatExpiry(value: string | null) {
  if (!value) return "Sin vencimiento";
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export default function SocioApp({ memberId, signature, qrDataUrl }: Props) {
  const base = `/api/socio/${memberId}`;
  const query = `?s=${encodeURIComponent(signature)}`;

  const [tab, setTab] = useState<Tab>("carnet");
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // El pedido armado se guarda en el celular: si el socio tiene que cargar
  // saldo, Mercado Pago lo saca de la app y al volver el pedido sigue ahi.
  const cartStorageKey = `cp-socio-cart:${memberId}`;
  const [cart, setCart] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = JSON.parse(window.localStorage.getItem(cartStorageKey) ?? "{}");
      return saved && typeof saved === "object" && !Array.isArray(saved) ? (saved as Record<string, number>) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      if (Object.keys(cart).length === 0) window.localStorage.removeItem(cartStorageKey);
      else window.localStorage.setItem(cartStorageKey, JSON.stringify(cart));
    } catch {
      // Sin almacenamiento disponible: el pedido funciona igual, solo no se recuerda.
    }
  }, [cart, cartStorageKey]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [payment, setPayment] = useState<"wallet" | "en_barra">("wallet");
  const [deliveryMode, setDeliveryMode] = useState<"barra" | "mesa">("barra");
  const [deliveryTable, setDeliveryTable] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [tableChoice, setTableChoice] = useState<Table | null>(null);
  const [tablePayment, setTablePayment] = useState<"wallet" | "en_barra">("en_barra");
  const keyRef = useRef<string | null>(null);
  const tableKeyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${base}${query}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo cargar.");
      setData(result as AppData);
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "No se pudo cargar.");
    }
  }, [base, query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Recarga de saldo con Mercado Pago.
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState("5000");
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupError, setTopupError] = useState("");
  const [topupAccepted, setTopupAccepted] = useState(false);

  // Abre la recarga con el monto que falta (redondeado hacia arriba a $ 1.000).
  function openTopupFor(shortfall: number) {
    const rounded = Math.min(200000, Math.max(1000, Math.ceil(shortfall / 1000) * 1000));
    setTopupAmount(String(rounded));
    setTopupAccepted(false);
    setTopupError("");
    setError("");
    setCheckoutOpen(false);
    setTableChoice(null);
    setTopupOpen(true);
  }

  async function startTopup() {
    if (topupBusy) return;
    if (!topupAccepted) {
      setTopupError("Tenés que aceptar que el saldo no es reembolsable.");
      return;
    }
    setTopupBusy(true);
    setTopupError("");
    try {
      const response = await fetch(`${base}/recarga${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(topupAmount), acceptedTerms: topupAccepted }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo iniciar la recarga.");
      window.location.href = result.checkoutUrl;
    } catch (err) {
      setTopupError(err instanceof Error ? err.message : "No se pudo iniciar la recarga.");
      setTopupBusy(false);
    }
  }

  // Al volver de Mercado Pago (?recarga=ID) se verifica el pago hasta que se
  // acredite: el webhook suele llegar antes, pero se consulta igual por si demora.
  useEffect(() => {
    const topupId = new URLSearchParams(window.location.search).get("recarga");
    if (!topupId) return;
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        try {
          const response = await fetch(`${base}/recarga/verificar${query}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topupId }),
          });
          const result = await response.json();
          if (response.ok && result.status === "approved") {
            if (!cancelled) {
              setNotice(`Recarga acreditada: ${money(Number(result.amountMinor))}`);
              await load();
              // Si estaba armando un pedido, vuelve directo a la carta para confirmarlo.
              try {
                if (window.localStorage.getItem(cartStorageKey)) setTab("carta");
              } catch {
                // Sin almacenamiento: se queda en el carnet.
              }
            }
            break;
          }
          if (response.ok && result.status === "refunded") {
            if (!cancelled) setNotice("Esa recarga fue reembolsada.");
            break;
          }
          if (!cancelled) setNotice("Estamos verificando tu pago con Mercado Pago…");
        } catch {
          if (!cancelled) setNotice("Estamos verificando tu pago con Mercado Pago…");
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (attempt === 7 && !cancelled) setNotice("Todavía no vemos el pago. Si ya pagaste, se acredita solo en unos minutos.");
      }
      if (!cancelled) window.history.replaceState(null, "", `${window.location.pathname}?s=${encodeURIComponent(signature)}`);
    })();
    return () => { cancelled = true; };
  }, [base, query, signature, load, cartStorageKey]);

  // Ranking: se carga al abrir la solapa y al cambiar de periodo.
  const [rankingPeriod, setRankingPeriod] = useState<"month" | "all">("month");
  const [ranking, setRanking] = useState<RankingData | null>(null);
  const [rankingError, setRankingError] = useState("");
  const [lastWinners, setLastWinners] = useState<LastWinner[]>([]);
  useEffect(() => {
    if (tab !== "ranking") return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${base}/ranking${query}&period=${rankingPeriod}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "No se pudo cargar el ranking.");
        if (!cancelled) {
          setRanking(result.ranking as RankingData);
          setLastWinners((result.lastWinners ?? []) as LastWinner[]);
          setRankingError("");
        }
      } catch (err) {
        if (!cancelled) setRankingError(err instanceof Error ? err.message : "No se pudo cargar el ranking.");
      }
    })();
    return () => { cancelled = true; };
  }, [tab, rankingPeriod, base, query]);

  // Mientras hay un pedido en curso, se refresca solo para ver cuando esta listo.
  const hasOpenOrder = (data?.orders ?? []).some((o) => o.status === "pending" || o.status === "ready");
  useEffect(() => {
    if (!hasOpenOrder) return;
    const timer = setInterval(() => { load(); }, 12000);
    return () => clearInterval(timer);
  }, [hasOpenOrder, load]);

  const menuById = useMemo(() => new Map((data?.menu ?? []).map((m) => [m.id, m])), [data]);
  const cartLines = Object.entries(cart).map(([id, qty]) => ({ item: menuById.get(id), qty })).filter((l): l is { item: MenuItem; qty: number } => Boolean(l.item) && l.qty > 0);
  const cartCount = cartLines.reduce((sum, l) => sum + l.qty, 0);
  const cartTotal = cartLines.reduce((sum, l) => sum + (l.item.kind === "premio" ? 0 : l.item.price_minor * l.qty), 0);
  const cartPointsCost = cartLines.reduce((sum, l) => sum + (l.item.kind === "premio" ? (l.item.points_cost ?? 0) * l.qty : 0), 0);
  const cartPointsEarned = cartLines.reduce((sum, l) => sum + (l.item.kind === "premio" ? 0 : l.item.points_earned * l.qty), 0);

  const member = data?.member;
  const isActive = member?.status === "active";
  const canPayWithWallet = (member?.balanceMinor ?? 0) >= cartTotal;
  const activeMesa = (data?.orders ?? []).find((o) => o.kind === "mesa" && (o.status === "pending" || o.status === "ready"));

  function changeCart(id: string, delta: number) {
    keyRef.current = null; // otro carrito = otro pedido
    setCart((prev) => {
      const next = Math.max(0, Math.min(20, (prev[id] ?? 0) + delta));
      const copy = { ...prev };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  }

  function openCheckout() {
    setError("");
    setNotice("");
    setPayment(cartTotal === 0 || canPayWithWallet ? (cartTotal === 0 ? "en_barra" : "wallet") : "en_barra");
    if (activeMesa) {
      setDeliveryMode("mesa");
      setDeliveryTable(activeMesa.items[0]?.name ?? "");
    }
    setCheckoutOpen(true);
  }

  async function submitOrder() {
    if (busy) return;
    if (deliveryMode === "mesa" && !deliveryTable.trim()) {
      setError("Indicá en qué mesa estás.");
      return;
    }
    setBusy(true);
    setError("");
    if (!keyRef.current) keyRef.current = crypto.randomUUID();
    try {
      const response = await fetch(`${base}/pedido${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "consumo",
          items: cartLines.map((l) => ({ id: l.item.id, qty: l.qty })),
          payment,
          delivery: deliveryMode === "mesa" ? `Mesa: ${deliveryTable.trim()}` : "Retiro en la barra",
          note,
          key: keyRef.current,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo hacer el pedido.");
      keyRef.current = null;
      setCart({});
      setNote("");
      setCheckoutOpen(false);
      setNotice(`Pedido enviado. Tu código: ${result.pickupCode}`);
      await load();
      setTab("pedidos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo hacer el pedido.");
    } finally {
      setBusy(false);
    }
  }

  async function reserveTable() {
    if (busy || !tableChoice) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${base}/pedido${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "mesa", tableId: tableChoice.id, payment: tablePayment, key: tableKeyRef.current }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo reservar.");
      setTableChoice(null);
      setNotice(`Mesa reservada. Tu código: ${result.pickupCode}`);
      await load();
      setTab("pedidos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reservar.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder(order: Order) {
    if (busy || !window.confirm("¿Cancelar este pedido? Se te devuelve el saldo y los puntos.")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${base}/pedido${query}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo cancelar.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cancelar.");
    } finally {
      setBusy(false);
    }
  }

  const grouped = (["trago", "combo", "premio"] as const).map((kind) => ({ kind, items: (data?.menu ?? []).filter((m) => m.kind === kind) })).filter((g) => g.items.length > 0);

  return (
    <main className="min-h-screen bg-[#050505] pb-28 text-[#f7f3ed]">
      <div className="mx-auto w-full max-w-[440px] px-5 pt-8">
        <header className="text-center">
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-violet-300">{data?.organization.name ?? "Capital Pass"}</p>
          <p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Socio premium</p>
        </header>

        {loadError && <div className="mt-5 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{loadError}</div>}
        {notice && <div className="mt-5 border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-300">{notice}</div>}
        {error && !checkoutOpen && !tableChoice && <div className="mt-5 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {!data && !loadError && <div className="mt-10 text-center text-sm text-white/35">Cargando…</div>}

        {/* Si la app no carga, el carnet con el QR se muestra igual. */}
        {!data && loadError && (
          <div className="mx-auto mt-5 w-fit rounded-2xl bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="Código QR del socio" className="h-52 w-52" />
          </div>
        )}

        {data && member && (
          <>
            {member.status !== "active" && (
              <div className="mt-5 border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
                Tu membresía no está activa. Consultá con el boliche para poder pedir.
              </div>
            )}

            {/* Por donde va el colectivo (si tiene pasaje de traslado) */}
            {tab === "carnet" && <ColectivoTracker endpoint={`${base}/colectivo${query}`} />}

            {/* Premios del ranking mensual ganados y todavia sin retirar */}
            {(tab === "carnet" || tab === "ranking") && (data.wonPrizes ?? []).filter((p) => !p.claimed_at).map((prize) => (
              <div key={prize.id} className="mt-5 border border-amber-400/40 bg-gradient-to-r from-amber-400/[0.14] to-transparent px-5 py-4">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300">🏆 ¡Ganaste el ranking de {monthName(prize.period)}!</p>
                <p className="mt-1 text-lg font-black">{MEDALS[prize.position - 1]} {prize.prize}</p>
                <p className="mt-1 text-xs text-white/50">Mostrá esta pantalla en la barra o en la puerta para retirar tu premio.</p>
              </div>
            ))}

            {/* CARNET */}
            {tab === "carnet" && (
              <section className={`mt-5 overflow-hidden rounded-[28px] border ${isActive ? "border-violet-400/30" : "border-white/10"} bg-gradient-to-b from-white/[0.06] to-white/[0.02]`}>
                <div className="px-6 py-6 text-center">
                  <h1 className="text-2xl font-black">{member.firstName} {member.lastName}</h1>
                  <p className="mt-1 font-mono text-sm tracking-[0.15em] text-white/50">{member.code}</p>

                  <div className="mt-4 flex justify-center gap-3">
                    <div className="border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-2">
                      <p className="text-[9px] font-black uppercase tracking-wide text-emerald-300/70">Saldo</p>
                      <p className="text-lg font-black text-emerald-300">{money(member.balanceMinor)}</p>
                    </div>
                    <div className="border border-violet-400/25 bg-violet-400/[0.08] px-4 py-2">
                      <p className="text-[9px] font-black uppercase tracking-wide text-violet-300/70">Puntos</p>
                      <p className="text-lg font-black text-violet-300">{member.pointsBalance}</p>
                    </div>
                  </div>

                  {data.organization.topupsEnabled && isActive && (
                    <button type="button" onClick={() => { setTopupError(""); setTopupAccepted(false); setTopupOpen(true); }} className="mt-4 h-11 w-full border border-emerald-400/40 bg-emerald-400/10 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-300">
                      + Cargar saldo
                    </button>
                  )}
                  <p className="mt-2 text-[10px] text-white/30">El saldo es para consumir en el boliche y no es reembolsable.</p>

                  <div className="mx-auto mt-6 w-fit rounded-2xl bg-white p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="Código QR del socio" className="h-52 w-52" />
                  </div>
                  <p className="mt-4 text-xs text-white/35">Vence: {formatExpiry(member.expiresAt)}</p>
                  <p className="mt-3 text-[11px] text-white/30">
                    Presentá este QR en la puerta{data.organization.checkinPoints > 0 ? ` y sumá ${data.organization.checkinPoints} puntos por cada fiesta` : ""}.
                  </p>
                </div>
              </section>
            )}

            {/* CARTA */}
            {tab === "carta" && (
              <section className="mt-5">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Pedí sin hacer fila</p>
                {grouped.length === 0 && <div className="mt-4 border border-dashed border-white/10 p-8 text-center text-sm text-white/35">El boliche todavía no cargó su carta.</div>}
                {grouped.map((group) => (
                  <div key={group.kind} className="mt-6">
                    <h2 className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">{KIND_TITLE[group.kind]}</h2>
                    <div className="mt-3 space-y-2">
                      {group.items.map((item) => {
                        const qty = cart[item.id] ?? 0;
                        const affordable = item.kind !== "premio" || (item.points_cost ?? 0) <= member.pointsBalance;
                        return (
                          <div key={item.id} className="flex items-center gap-3 border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold">{item.name}</p>
                              {item.description && <p className="mt-0.5 text-[11px] text-white/40">{item.description}</p>}
                              <p className="mt-1 text-xs">
                                {item.kind === "premio" ? (
                                  <span className="font-black text-violet-300">{item.points_cost} puntos</span>
                                ) : (
                                  <>
                                    <span className="font-black text-emerald-300">{money(item.price_minor)}</span>
                                    {item.points_earned > 0 && <span className="ml-2 text-violet-300/80">+{item.points_earned} pts</span>}
                                  </>
                                )}
                              </p>
                            </div>
                            {qty === 0 ? (
                              <button
                                type="button"
                                disabled={!isActive || !affordable}
                                onClick={() => changeCart(item.id, 1)}
                                className="h-10 shrink-0 border border-violet-400/40 bg-violet-400/10 px-4 text-[10px] font-black uppercase tracking-wide text-violet-200 disabled:opacity-30"
                              >
                                {affordable ? "Agregar" : "Faltan puntos"}
                              </button>
                            ) : (
                              <div className="flex shrink-0 items-center gap-2">
                                <button type="button" onClick={() => changeCart(item.id, -1)} className="h-10 w-10 border border-white/15 text-lg font-black">−</button>
                                <span className="w-5 text-center text-sm font-black">{qty}</span>
                                <button type="button" onClick={() => changeCart(item.id, 1)} className="h-10 w-10 border border-violet-400/40 bg-violet-400/10 text-lg font-black text-violet-200">+</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* MESAS */}
            {tab === "mesas" && (
              <section className="mt-5">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Reservá tu mesa</p>
                {data.events.length === 0 && <div className="mt-4 border border-dashed border-white/10 p-8 text-center text-sm text-white/35">No hay fiestas próximas con mesas disponibles.</div>}
                {data.events.map((event) => (
                  <div key={event.id} className="mt-6">
                    <h2 className="text-sm font-black">{event.name}</h2>
                    <p className="text-[11px] text-white/40">{formatDate(event.starts_at)}</p>
                    {event.tables.length === 0 ? (
                      <p className="mt-2 text-xs text-white/30">Sin mesas disponibles.</p>
                    ) : (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {event.tables.map((table) => (
                          <button
                            key={table.id}
                            type="button"
                            disabled={!isActive}
                            onClick={() => { setError(""); setTablePayment("en_barra"); tableKeyRef.current = crypto.randomUUID(); setTableChoice(table); }}
                            className="border border-white/[0.10] bg-white/[0.02] px-3 py-3 text-left transition hover:border-violet-400/40 disabled:opacity-30"
                          >
                            <p className="text-sm font-black">{table.name}</p>
                            <p className="text-[11px] text-white/40">{table.capacity ? `${table.capacity} personas` : "Mesa"}</p>
                            <p className="mt-1 text-xs font-black text-emerald-300">{table.price_minor ? money(table.price_minor) : "Sin costo"}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {/* PEDIDOS */}
            {tab === "pedidos" && (
              <section className="mt-5 space-y-3">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Tus pedidos</p>
                {data.orders.length === 0 && <div className="border border-dashed border-white/10 p-8 text-center text-sm text-white/35">Todavía no hiciste ningún pedido.</div>}
                {data.orders.map((order) => (
                  <div key={order.id} className={`border px-4 py-3 ${order.status === "ready" ? "border-emerald-400/40 bg-emerald-400/[0.05]" : "border-white/[0.08] bg-white/[0.02]"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${STATUS_STYLE[order.status]}`}>{STATUS_LABEL[order.status]}</span>
                      <span className="font-mono text-lg font-black tracking-[0.2em]">{order.pickup_code}</span>
                    </div>
                    <ul className="mt-2 space-y-0.5 text-sm">
                      {order.items.map((item, index) => (
                        <li key={index} className="text-white/80">{item.qty} × {item.name}</li>
                      ))}
                    </ul>
                    {order.delivery && <p className="mt-1 text-[11px] text-white/45">{order.delivery}</p>}
                    <p className="mt-2 text-[11px] text-white/40">
                      {order.total_minor > 0 ? `${money(order.total_minor)} · ${order.payment === "wallet" ? "Pagado con saldo" : "Se paga en el boliche"}` : ""}
                      {order.points_cost > 0 ? ` ${order.total_minor > 0 ? "· " : ""}${order.points_cost} puntos canjeados` : ""}
                      {order.points_earned > 0 && order.status !== "cancelled" ? ` · ${order.status === "delivered" ? "+" : "sumás "}${order.points_earned} pts` : ""}
                    </p>
                    <p className="mt-1 text-[10px] text-white/25">{formatDate(order.created_at)}</p>
                    {order.status === "pending" && (
                      <button type="button" disabled={busy} onClick={() => cancelOrder(order)} className="mt-3 h-9 border border-red-400/25 px-3 text-[10px] font-black uppercase tracking-wide text-red-300/80 hover:text-red-300 disabled:opacity-40">
                        Cancelar pedido
                      </button>
                    )}
                  </div>
                ))}
              </section>
            )}

            {/* RANKING */}
            {tab === "ranking" && (
              <section className="mt-5">
                <div className="grid grid-cols-2 gap-2">
                  {(["month", "all"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { setRanking(null); setRankingPeriod(p); }}
                      className={`h-10 border text-[10px] font-black uppercase tracking-wide ${rankingPeriod === p ? "border-violet-400/60 bg-violet-400/15 text-violet-200" : "border-white/15 text-white/50"}`}
                    >
                      {p === "month" ? "Este mes" : "Histórico"}
                    </button>
                  ))}
                </div>

                {rankingError && <div className="mt-4 border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{rankingError}</div>}
                {!ranking && !rankingError && <div className="mt-8 text-center text-sm text-white/35">Cargando…</div>}

                {ranking && !ranking.enabled && (
                  <div className="mt-4 border border-dashed border-white/10 p-8 text-center text-sm text-white/35">El boliche no tiene activado el ranking.</div>
                )}

                {ranking && ranking.enabled && (
                  <>
                    {rankingPeriod === "month" && (ranking.prizes ?? []).length > 0 && (
                      <div className="mt-4 border border-amber-400/30 bg-amber-400/[0.07] px-5 py-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300">🏆 Premios del mes</p>
                        <ul className="mt-2 space-y-1 text-sm">
                          {ranking.prizes.map((p) => (
                            <li key={p.position} className="flex gap-2"><span>{MEDALS[p.position - 1]}</span><span className="font-bold">{p.prize}</span></li>
                          ))}
                        </ul>
                        <p className="mt-2 text-[11px] text-white/40">Ganan los mejores del ranking al terminar el mes. Si hay empate, gana quien llegó primero.</p>
                      </div>
                    )}

                    {ranking.me ? (
                      <div className="mt-4 border border-violet-400/30 bg-violet-400/[0.08] px-5 py-4 text-center">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-300/70">Tu posición</p>
                        <p className="mt-1 text-4xl font-black text-violet-200">#{ranking.me.position}</p>
                        <p className="mt-1 text-xs text-white/45">{ranking.me.points} puntos · {ranking.participants} {ranking.participants === 1 ? "socio compite" : "socios compiten"}</p>
                      </div>
                    ) : (
                      <div className="mt-4 border border-white/10 px-5 py-4 text-center text-sm text-white/45">
                        Todavía no sumaste puntos {rankingPeriod === "month" ? "este mes" : ""}. Pedí desde la carta o vení a la próxima fiesta para entrar al ranking.
                      </div>
                    )}

                    {ranking.top.length > 0 && (
                      <ol className="mt-4 space-y-1.5">
                        {ranking.top.map((row) => (
                          <li key={`${row.position}-${row.name}`} className={`flex items-center gap-3 border px-4 py-3 ${row.isMe ? "border-violet-400/50 bg-violet-400/10" : "border-white/[0.06] bg-white/[0.02]"}`}>
                            <span className="w-8 shrink-0 text-center text-lg font-black">{row.position <= 3 ? MEDALS[row.position - 1] : `#${row.position}`}</span>
                            <span className="min-w-0 flex-1 truncate text-sm font-bold">{row.name}{row.isMe ? " (vos)" : ""}</span>
                            <span className="shrink-0 text-sm font-black text-violet-300">{row.points} pts</span>
                          </li>
                        ))}
                      </ol>
                    )}

                    {ranking.me && !ranking.top.some((r) => r.isMe) && (
                      <div className="mt-2 flex items-center gap-3 border border-violet-400/50 bg-violet-400/10 px-4 py-3">
                        <span className="w-8 shrink-0 text-center text-lg font-black">#{ranking.me.position}</span>
                        <span className="flex-1 text-sm font-bold">Vos</span>
                        <span className="text-sm font-black text-violet-300">{ranking.me.points} pts</span>
                      </div>
                    )}

                    {lastWinners.length > 0 && (
                      <div className="mt-6 border border-white/[0.08] bg-white/[0.02] px-5 py-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Ganadores de {monthName(lastWinners[0].period)}</p>
                        <ul className="mt-2 space-y-1 text-sm">
                          {lastWinners.map((w) => (
                            <li key={w.position} className="flex flex-wrap gap-x-2"><span>{MEDALS[w.position - 1]}</span><span className="font-bold">{w.name}</span><span className="text-white/45">· {w.prize}</span></li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <p className="mt-4 text-center text-[11px] text-white/30">Se ordena por puntos ganados. Canjear premios no te baja de posición.</p>
                  </>
                )}
              </section>
            )}

            {/* PUNTOS */}
            {tab === "puntos" && (
              <section className="mt-5">
                <div className="border border-violet-400/25 bg-violet-400/[0.06] px-5 py-6 text-center">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-300/70">Tus puntos</p>
                  <p className="mt-1 text-5xl font-black text-violet-200">{member.pointsBalance}</p>
                  <p className="mt-3 text-xs text-white/40">
                    Sumás puntos con cada trago o combo que te entregan{data.organization.checkinPoints > 0 ? ` y ${data.organization.checkinPoints} por cada fiesta a la que vas` : ""}. Canjealos por premios en la carta.
                  </p>
                  <button type="button" onClick={() => setTab("carta")} className="mt-4 h-10 border border-violet-400/40 px-5 text-[10px] font-black uppercase tracking-wide text-violet-200">
                    Ver premios
                  </button>
                </div>

                <h2 className="mt-8 text-xs font-black uppercase tracking-[0.18em] text-white/40">Movimientos</h2>
                <div className="mt-3 space-y-1.5">
                  {data.points.length === 0 && <p className="text-sm text-white/30">Todavía no tenés movimientos.</p>}
                  {data.points.map((row) => (
                    <div key={row.id} className="flex items-center justify-between border border-white/[0.06] px-4 py-2.5 text-sm">
                      <div>
                        <p className="text-white/80">{row.reason}</p>
                        <p className="text-[10px] text-white/30">{formatDate(row.created_at)}</p>
                      </div>
                      <span className={`font-black ${row.delta > 0 ? "text-emerald-300" : "text-amber-300"}`}>{row.delta > 0 ? `+${row.delta}` : row.delta}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Barra del carrito */}
      {tab === "carta" && cartCount > 0 && !checkoutOpen && (
        <div className="fixed inset-x-0 bottom-[68px] z-20 px-5">
          <button type="button" onClick={openCheckout} className="mx-auto flex h-14 w-full max-w-[440px] items-center justify-between bg-violet-500 px-5 text-sm font-black text-white shadow-lg">
            <span>Ver pedido ({cartCount})</span>
            <span>{cartTotal > 0 ? money(cartTotal) : ""}{cartTotal > 0 && cartPointsCost > 0 ? " + " : ""}{cartPointsCost > 0 ? `${cartPointsCost} pts` : ""}</span>
          </button>
        </div>
      )}

      {/* Navegacion inferior */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[440px]">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setTab(item.id); setNotice(""); setError(""); }}
              className={`relative h-[68px] flex-1 text-[9px] font-black uppercase tracking-wide transition ${tab === item.id ? "text-violet-300" : "text-white/40"}`}
            >
              {item.label}
              {item.id === "pedidos" && hasOpenOrder && <span className="absolute right-[22%] top-3 h-2 w-2 rounded-full bg-emerald-400" />}
              {tab === item.id && <span className="absolute inset-x-4 top-0 h-0.5 bg-violet-400" />}
            </button>
          ))}
        </div>
      </nav>

      {/* Checkout */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/70" onClick={() => !busy && setCheckoutOpen(false)}>
          <div className="mx-auto max-h-[92vh] w-full max-w-[440px] overflow-y-auto border-t border-violet-400/30 bg-[#0d0d0d] px-5 py-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black">Tu pedido</h2>
            <ul className="mt-3 space-y-1.5">
              {cartLines.map((l) => (
                <li key={l.item.id} className="flex justify-between text-sm">
                  <span>{l.qty} × {l.item.name}</span>
                  <span className="text-white/60">{l.item.kind === "premio" ? `${(l.item.points_cost ?? 0) * l.qty} pts` : money(l.item.price_minor * l.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-white/10 pt-3 text-sm font-black">
              <span>Total</span>
              <span>{cartTotal > 0 ? money(cartTotal) : "—"}{cartPointsCost > 0 ? ` ${cartTotal > 0 ? "+ " : ""}${cartPointsCost} pts` : ""}</span>
            </div>
            {cartPointsEarned > 0 && <p className="mt-1 text-xs text-violet-300">Sumás {cartPointsEarned} puntos cuando te lo entreguen.</p>}

            <p className="mt-5 text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Dónde lo recibís</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDeliveryMode("barra")} className={`h-11 border text-[10px] font-black uppercase tracking-wide ${deliveryMode === "barra" ? "border-violet-400/60 bg-violet-400/15 text-violet-200" : "border-white/15 text-white/50"}`}>Retiro en barra</button>
              <button type="button" onClick={() => setDeliveryMode("mesa")} className={`h-11 border text-[10px] font-black uppercase tracking-wide ${deliveryMode === "mesa" ? "border-violet-400/60 bg-violet-400/15 text-violet-200" : "border-white/15 text-white/50"}`}>Llevar a mi mesa</button>
            </div>
            {deliveryMode === "mesa" && (
              <input value={deliveryTable} onChange={(e) => setDeliveryTable(e.target.value)} placeholder="Número o nombre de tu mesa" maxLength={60} className="mt-2 h-11 w-full border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-violet-400/50" />
            )}

            {cartTotal > 0 && (
              <>
                <p className="mt-5 text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Cómo pagás</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" disabled={!canPayWithWallet} onClick={() => setPayment("wallet")} className={`h-11 border text-[10px] font-black uppercase tracking-wide disabled:opacity-30 ${payment === "wallet" ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200" : "border-white/15 text-white/50"}`}>
                    Con saldo ({money(member?.balanceMinor ?? 0)})
                  </button>
                  <button type="button" onClick={() => setPayment("en_barra")} className={`h-11 border text-[10px] font-black uppercase tracking-wide ${payment === "en_barra" ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200" : "border-white/15 text-white/50"}`}>
                    Pago al recibir
                  </button>
                </div>
                {!canPayWithWallet && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2">
                    <p className="text-xs text-amber-100/80">Te faltan {money(cartTotal - (member?.balanceMinor ?? 0))} de saldo.</p>
                    {data?.organization.topupsEnabled && (
                      <button type="button" onClick={() => openTopupFor(cartTotal - (member?.balanceMinor ?? 0))} className="h-9 border border-emerald-400/40 bg-emerald-400/10 px-3 text-[10px] font-black uppercase tracking-wide text-emerald-300">
                        Cargar saldo
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Aclaración (opcional)" maxLength={200} className="mt-5 h-11 w-full border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-violet-400/50" />

            {error && <div className="mt-4 border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}

            <div className="mt-5 flex gap-2">
              <button type="button" disabled={busy} onClick={() => setCheckoutOpen(false)} className="h-12 flex-1 border border-white/15 text-[10px] font-black uppercase tracking-wide text-white/60">Seguir viendo</button>
              <button type="button" disabled={busy} onClick={submitOrder} className="h-12 flex-[2] bg-violet-500 text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-40">
                {busy ? "Enviando…" : "Confirmar pedido"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recarga de saldo */}
      {topupOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/70" onClick={() => !topupBusy && setTopupOpen(false)}>
          <div className="mx-auto w-full max-w-[440px] border-t border-emerald-400/30 bg-[#0d0d0d] px-5 py-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black">Cargar saldo</h2>
            <p className="mt-1 text-sm text-white/50">Pagás con Mercado Pago (tarjeta, dinero en cuenta o transferencia) y se acredita solo, en segundos.</p>

            <div className="mt-4 grid grid-cols-4 gap-2">
              {["2000", "5000", "10000", "20000"].map((value) => (
                <button key={value} type="button" onClick={() => setTopupAmount(value)} className={`h-11 border text-xs font-black ${topupAmount === value ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200" : "border-white/15 text-white/60"}`}>
                  {money(Number(value))}
                </button>
              ))}
            </div>
            <label className="mt-3 block">
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Otro monto ($)</span>
              <input value={topupAmount} onChange={(e) => setTopupAmount(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="mt-2 h-11 w-full border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none focus:border-emerald-400/50" />
            </label>
            <p className="mt-2 text-[11px] text-white/30">Mínimo $ 1.000 · Máximo $ 200.000. El saldo es para consumir en {data?.organization.name ?? "el boliche"}.</p>

            <label className="mt-4 flex cursor-pointer items-start gap-3 border border-amber-400/25 bg-amber-400/[0.06] px-3 py-3">
              <input type="checkbox" checked={topupAccepted} onChange={(e) => { setTopupAccepted(e.target.checked); setTopupError(""); }} className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-400" />
              <span className="text-xs leading-relaxed text-amber-100/80">
                Entiendo que el saldo cargado <strong>no es reembolsable</strong>: no se puede retirar ni transferir, solo se usa para consumir en este boliche.
              </span>
            </label>

            {topupError && <div className="mt-4 border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">{topupError}</div>}

            <div className="mt-5 flex gap-2">
              <button type="button" disabled={topupBusy} onClick={() => setTopupOpen(false)} className="h-12 flex-1 border border-white/15 text-[10px] font-black uppercase tracking-wide text-white/60">Volver</button>
              <button type="button" disabled={topupBusy || !topupAmount || !topupAccepted} onClick={startTopup} className="h-12 flex-[2] bg-emerald-500 text-[11px] font-black uppercase tracking-wide text-black disabled:opacity-40">
                {topupBusy ? "Abriendo Mercado Pago…" : `Pagar ${topupAmount ? money(Number(topupAmount)) : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reserva de mesa */}
      {tableChoice && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/70" onClick={() => !busy && setTableChoice(null)}>
          <div className="mx-auto w-full max-w-[440px] border-t border-violet-400/30 bg-[#0d0d0d] px-5 py-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black">Reservar {tableChoice.name}</h2>
            <p className="mt-1 text-sm text-white/50">{tableChoice.capacity ? `${tableChoice.capacity} personas · ` : ""}{tableChoice.price_minor ? money(tableChoice.price_minor) : "Sin costo"}</p>

            {tableChoice.price_minor ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" disabled={(member?.balanceMinor ?? 0) < tableChoice.price_minor} onClick={() => setTablePayment("wallet")} className={`h-11 border text-[10px] font-black uppercase tracking-wide disabled:opacity-30 ${tablePayment === "wallet" ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200" : "border-white/15 text-white/50"}`}>
                  Con saldo
                </button>
                <button type="button" onClick={() => setTablePayment("en_barra")} className={`h-11 border text-[10px] font-black uppercase tracking-wide ${tablePayment === "en_barra" ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200" : "border-white/15 text-white/50"}`}>
                  Pago en el boliche
                </button>
              </div>
            ) : null}
            {tableChoice.price_minor && (member?.balanceMinor ?? 0) < tableChoice.price_minor ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2">
                <p className="text-xs text-amber-100/80">Te faltan {money(tableChoice.price_minor - (member?.balanceMinor ?? 0))} de saldo.</p>
                {data?.organization.topupsEnabled && (
                  <button type="button" onClick={() => openTopupFor((tableChoice.price_minor ?? 0) - (member?.balanceMinor ?? 0))} className="h-9 border border-emerald-400/40 bg-emerald-400/10 px-3 text-[10px] font-black uppercase tracking-wide text-emerald-300">
                    Cargar saldo
                  </button>
                )}
              </div>
            ) : null}

            {error && <div className="mt-4 border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}

            <div className="mt-5 flex gap-2">
              <button type="button" disabled={busy} onClick={() => setTableChoice(null)} className="h-12 flex-1 border border-white/15 text-[10px] font-black uppercase tracking-wide text-white/60">Volver</button>
              <button type="button" disabled={busy} onClick={reserveTable} className="h-12 flex-[2] bg-violet-500 text-[11px] font-black uppercase tracking-wide text-white disabled:opacity-40">
                {busy ? "Reservando…" : "Confirmar reserva"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
