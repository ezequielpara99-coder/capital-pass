"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

type EventRow = { id: string; name: string };
type RouteRow = { id: string; name: string; departure_location: string | null };

type ValidationResult = {
  result: "valid" | "already_used" | "invalid" | "cancelled";
  transfer_ticket_id: string | null;
  passenger_name: string | null;
  validated_at: string | null;
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
