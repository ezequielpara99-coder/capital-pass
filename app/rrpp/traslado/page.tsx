"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

type EventRow = { id: string; name: string };
type StopRow = { id: string; position: number; name: string };
type RouteRow = { id: string; name: string; departure_location: string | null; stops: StopRow[]; current_stop_id: string | null };

type ValidationResult = {
  result: "valid" | "already_used" | "invalid" | "cancelled";
  transfer_ticket_id: string | null;
  passenger_name: string | null;
  validated_at: string | null;
  stop_name?: string | null;
};

const RESULT_STYLE: Record<ValidationResult["result"], string> = {
  valid: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  already_used: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  invalid: "border-red-400/30 bg-red-500/10 text-red-200",
  cancelled: "border-red-400/30 bg-red-500/10 text-red-200",
};

const RESULT_LABEL: Record<ValidationResult["result"], string> = {
  valid: "✓ Embarcó",
  already_used: "Ya había embarcado",
  invalid: "Código inválido",
  cancelled: "Pasaje cancelado",
};

export default function TrasladoRRPPPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [event, setEvent] = useState<EventRow | null>(null);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [routeId, setRouteId] = useState("");
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [stopBusy, setStopBusy] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          window.location.replace("/login");
          return;
        }

        const { data: membership } = await supabase
          .from("organization_members")
          .select("id")
          .eq("user_id", user.id)
          .eq("role", "rrpp")
          .eq("status", "active")
          .limit(1)
          .maybeSingle();
        if (!membership) {
          window.location.replace("/login");
          return;
        }

        const { data: staffRows } = await supabase
          .from("event_staff")
          .select("event_id")
          .eq("organization_member_id", membership.id)
          .eq("staff_role", "rrpp")
          .eq("active", true);

        const eventIds = (staffRows ?? []).map((s) => s.event_id);
        if (eventIds.length === 0) {
          setError("No tenés ningún evento asignado.");
          return;
        }

        const { data: events } = await supabase
          .from("events")
          .select("id, name, starts_at")
          .in("id", eventIds)
          .order("starts_at", { ascending: true })
          .order("created_at", { ascending: false });

        const selectedEvent = (events ?? [])[0];
        if (!selectedEvent) {
          setError("No se pudo encontrar el evento asignado.");
          return;
        }
        setEvent({ id: selectedEvent.id, name: selectedEvent.name });

        const routesResponse = await fetch(`/api/rrpps/traslados?eventId=${selectedEvent.id}`, { cache: "no-store" });
        const routesResult = await routesResponse.json();
        if (!routesResponse.ok) throw new Error(routesResult.error ?? "No se pudieron cargar los colectivos.");

        const myRoutes = (routesResult.routes ?? []).filter((r: { active: boolean }) => r.active);
        setRoutes(myRoutes);
        if (myRoutes.length > 0) setRouteId(myRoutes[0].id);
        if (myRoutes.length === 0) setError("Todavía no tenés ningún colectivo activo en este evento.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [supabase]);

  // Vuelve a pedir los colectivos (para ver por donde va despues de un escaneo).
  async function refreshRoutes(eventId: string) {
    try {
      const response = await fetch(`/api/rrpps/traslados?eventId=${eventId}`, { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setRoutes((data.routes ?? []).filter((r: { active: boolean }) => r.active));
    } catch {
      // Si falla, se sigue mostrando lo que ya estaba.
    }
  }

  // El colectivo cambio de parada: se avisa al celular de los socios que lo
  // esperan. Sin esperar respuesta: si falla, el embarque sigue igual.
  function notifyProgress() {
    if (!routeId) return;
    fetch("/api/rrpps/traslados/avisar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routeId }),
    }).catch(() => {});
  }

  async function markStop(stopId: string | null) {
    if (!routeId || !event || stopBusy) return;
    if (stopId === null && !window.confirm("¿Reiniciar el recorrido? Se borra por dónde pasó el colectivo.")) return;
    setStopBusy(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("transfer_mark_stop", { p_route_id: routeId, p_stop_id: stopId });
      if (rpcError) throw rpcError;
      if (stopId) notifyProgress();
      await refreshRoutes(event.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo marcar la parada.");
    } finally {
      setStopBusy(false);
    }
  }

  async function validate() {
    if (checking || !routeId || !code.trim()) return;
    setChecking(true);
    setError("");
    setResult(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("validate_transfer_ticket", {
        p_route_id: routeId,
        p_manual_code: code.trim(),
      });
      if (rpcError) throw rpcError;
      const row = (data ?? [])[0] as ValidationResult | undefined;
      if (row) setResult(row);
      setCode("");
      inputRef.current?.focus();
      if (row?.result === "valid" && event) {
        notifyProgress();
        await refreshRoutes(event.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo validar el código.");
    } finally {
      setChecking(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07050a] text-white">
        <p className="text-sm text-white/40">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07050a] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-180px] top-[-160px] h-[500px] w-[500px] rounded-full bg-[#ff2a1a]/25 blur-[130px]" />
        <div className="absolute bottom-[-180px] right-[-130px] h-[500px] w-[500px] rounded-full bg-[#ff5a2a]/20 blur-[130px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-lg px-5 py-7 sm:px-7 sm:py-10">
        <header className="mb-7 flex items-center justify-between">
          <button type="button" onClick={() => router.push("/rrpp")} className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm text-white/55 transition hover:text-white">
            ← Volver
          </button>
          <div className="text-right">
            <p className="text-sm font-semibold">Capital Pass</p>
            <p className="text-xs text-white/30">Traslado</p>
          </div>
        </header>

        <div className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff9b82]">{event?.name ?? "Evento"}</p>
          <h1 className="mt-2 text-3xl font-bold">Embarque</h1>
          <p className="mt-2 text-sm text-white/40">Pedile el código al pasajero y validalo acá.</p>
        </div>

        {error && (
          <div className="mb-5 rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-300">{error}</div>
        )}

        {routes.length > 0 && (
          <div className="space-y-5">
            {routes.length > 1 && (
              <label className="block">
                <span className="mb-2 block text-sm text-white/70">Colectivo</span>
                <select value={routeId} onChange={(e) => setRouteId(e.target.value)} className={inputClass}>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id} className="bg-[#100817]">{r.name}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-sm text-white/70">Código del pasajero</span>
              <input
                ref={inputRef}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") validate();
                }}
                placeholder="Ej: A1B2C3"
                autoFocus
                className={`${inputClass} text-center font-mono text-xl tracking-[0.2em]`}
              />
            </label>

            <button
              type="button"
              onClick={validate}
              disabled={checking || !code.trim()}
              className="h-16 w-full rounded-2xl bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] text-base font-bold text-white shadow-[0_15px_45px_rgba(255,42,26,0.25)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checking ? "Validando..." : "Validar"}
            </button>

            {result && (
              <div className={`rounded-2xl border px-5 py-4 text-center ${RESULT_STYLE[result.result]}`}>
                <p className="text-lg font-bold">{RESULT_LABEL[result.result]}</p>
                {result.passenger_name && <p className="mt-1 text-sm opacity-80">{result.passenger_name}</p>}
                {result.stop_name && <p className="mt-1 text-xs opacity-70">Sube en {result.stop_name}</p>}
              </div>
            )}

            {(routes.find((r) => r.id === routeId)?.stops.length ?? 0) > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Recorrido</p>
                <p className="mt-1 text-xs text-white/35">Cuando escaneás a un pasajero, el colectivo pasa a estar en su parada. Si en una parada no sube nadie, marcala acá.</p>
                <ol className="mt-4 space-y-2">
                  {(routes.find((r) => r.id === routeId)?.stops ?? []).map((stop) => {
                    const current = routes.find((r) => r.id === routeId)?.current_stop_id === stop.id;
                    const currentPosition = routes.find((r) => r.id === routeId)?.stops.find((s) => s.id === routes.find((r) => r.id === routeId)?.current_stop_id)?.position ?? 0;
                    const passed = stop.position < currentPosition;
                    return (
                      <li key={stop.id} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${current ? "border-emerald-400/50 bg-emerald-500/10" : passed ? "border-white/5 bg-black/10 opacity-50" : "border-white/10 bg-black/20"}`}>
                        <span className="text-sm">
                          <span className="mr-2 text-white/35">{stop.position}.</span>
                          {stop.name}
                          {current && <span className="ml-2 text-[10px] font-bold uppercase text-emerald-300">🚌 Acá está</span>}
                        </span>
                        {!current && (
                          <button type="button" disabled={stopBusy} onClick={() => markStop(stop.id)} className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white disabled:opacity-40">
                            Llegamos
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <button type="button" disabled={stopBusy} onClick={() => markStop(null)} className="mt-4 text-xs text-white/35 underline underline-offset-4 hover:text-white/60">
                  Reiniciar recorrido
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

const inputClass =
  "h-14 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-[#ff5a2a]/60 focus:ring-2 focus:ring-[#ff3b24]/10";
