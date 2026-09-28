"use client";

import { useEffect, useState } from "react";

type Stop = { id: string; position: number; name: string; arrivedAt: string | null };
type Tracked = {
  ticketId: string;
  manualCode: string;
  ticketStatus: "issued" | "used";
  routeId: string;
  routeName: string;
  eventName: string;
  departureAt: string | null;
  departureLocation: string | null;
  stops: Stop[];
  currentStopId: string | null;
  currentStopAt: string | null;
  myStopId: string | null;
  state: "not_started" | "approaching" | "at_my_stop" | "passed" | "no_stop";
  stopsAway: number | null;
  etaMinutes: number | null;
};

function formatDeparture(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));
}

function minutesAgo(value: string | null) {
  if (!value) return "";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

// Por donde va el colectivo del cliente: el ultimo pueblo donde se escaneo a
// un pasajero (o donde el RRPP marco "llegamos"), su parada y cuantas faltan.
// No es GPS: se actualiza cada vez que el colectivo pasa por una parada.
export default function ColectivoTracker({ endpoint }: { endpoint: string }) {
  const [routes, setRoutes] = useState<Tracked[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const result = await response.json();
        if (!cancelled && response.ok) setRoutes(result.routes ?? []);
      } catch {
        // Sin conexion: se queda con lo ultimo que se vio.
      }
    }

    load();
    const timer = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [endpoint]);

  if (routes.length === 0) return null;

  return (
    <section className="mt-5 space-y-3">
      {routes.map((route) => {
        const current = route.stops.find((s) => s.id === route.currentStopId) ?? null;
        const mine = route.stops.find((s) => s.id === route.myStopId) ?? null;
        const onBoard = route.ticketStatus === "used";

        let headline = "";
        let tone = "border-white/10 bg-white/[0.03] text-white";
        if (route.state === "not_started") headline = "El colectivo todavía no salió.";
        else if (route.state === "approaching") { headline = `El colectivo está en ${current?.name}.`; tone = "border-violet-400/40 bg-violet-400/[0.08] text-white"; }
        else if (route.state === "at_my_stop") { headline = `🚌 ¡El colectivo está en tu parada (${mine?.name})!`; tone = "border-emerald-400/50 bg-emerald-400/[0.12] text-emerald-100"; }
        else if (route.state === "passed") headline = onBoard ? "Ya estás a bordo." : `El colectivo ya pasó por ${mine?.name}.`;
        else headline = `El colectivo está en ${current?.name}.`;

        return (
          <div key={route.ticketId} className={`border px-5 py-4 ${tone}`}>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">🚌 Tu colectivo · {route.eventName}</p>
            <p className="mt-1 text-lg font-black leading-tight">{headline}</p>

            {route.state === "approaching" && (
              <p className="mt-1 text-sm text-white/70">
                Te {route.stopsAway === 1 ? "falta 1 parada" : `faltan ${route.stopsAway} paradas`} hasta {mine?.name}.
                {route.etaMinutes !== null && <span className="text-white/50"> Llega en unos {route.etaMinutes} min (estimado).</span>}
              </p>
            )}
            {current && <p className="mt-1 text-[11px] text-white/40">Última parada registrada {minutesAgo(route.currentStopAt)}.</p>}
            {route.state === "not_started" && route.departureAt && (
              <p className="mt-1 text-sm text-white/60">Sale {formatDeparture(route.departureAt)}{route.departureLocation ? ` desde ${route.departureLocation}` : ""}.</p>
            )}

            {route.stops.length > 0 && (
              <ol className="mt-4 space-y-0">
                {route.stops.map((stop, index) => {
                  const isCurrent = stop.id === route.currentStopId;
                  const isMine = stop.id === route.myStopId;
                  const passed = Boolean(current) && stop.position < (current?.position ?? 0);
                  return (
                    <li key={stop.id} className="flex gap-3">
                      <div className="flex w-5 shrink-0 flex-col items-center">
                        <span className={`mt-1 flex h-4 w-4 items-center justify-center rounded-full border text-[9px] ${
                          isCurrent ? "border-emerald-400 bg-emerald-400 text-black" : passed ? "border-white/30 bg-white/30" : "border-white/25 bg-transparent"
                        }`}>
                          {isCurrent ? "●" : ""}
                        </span>
                        {index < route.stops.length - 1 && <span className={`w-px flex-1 ${passed ? "bg-white/30" : "bg-white/10"}`} style={{ minHeight: 18 }} />}
                      </div>
                      <div className={`pb-3 text-sm ${passed ? "text-white/40" : "text-white"}`}>
                        <span className={isCurrent ? "font-black text-emerald-300" : isMine ? "font-black" : ""}>{stop.name}</span>
                        {isCurrent && <span className="ml-2 text-[10px] font-black uppercase text-emerald-300">🚌 acá está</span>}
                        {isMine && <span className="ml-2 border border-violet-400/50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-violet-300">Tu parada</span>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            {!onBoard && (
              <p className="mt-2 text-xs text-white/40">
                Tu código para subir: <span className="font-mono font-black tracking-[0.15em] text-white/80">{route.manualCode}</span>
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
