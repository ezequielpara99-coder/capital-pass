"use client";

import { useState } from "react";

export type SwitcherEvent = { id: string; name: string };

// Franja fina para poner debajo del header de cada pantalla del panel.
export function EventBar({
  events,
  currentEventId,
}: {
  events: SwitcherEvent[];
  currentEventId: string | null;
}) {
  if (events.length < 2) return null;

  return (
    <div className="relative z-10 border-b border-white/[0.07] bg-[#0a0807]/80">
      <div className="mx-auto max-w-[1480px] px-5 py-3 md:px-8 xl:px-10">
        <EventSwitcher events={events} currentEventId={currentEventId} className="max-w-[420px]" />
      </div>
    </div>
  );
}

// Selector de "evento que estoy administrando". Solo aparece si el
// organizador tiene mas de uno. Guarda la eleccion (cookie) y recarga la
// pantalla sin el parametro eventId de la URL, para que todo el panel pase
// a mostrar el evento elegido.
export default function EventSwitcher({
  events,
  currentEventId,
  className = "",
}: {
  events: SwitcherEvent[];
  currentEventId: string | null;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  if (events.length < 2) return null;

  async function change(eventId: string) {
    if (busy || eventId === currentEventId) return;
    setBusy(true);
    try {
      const response = await fetch("/api/panel/evento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (!response.ok) throw new Error();
      const url = new URL(window.location.href);
      url.searchParams.delete("eventId");
      window.location.assign(url.toString());
    } catch {
      setBusy(false);
    }
  }

  return (
    <label className={`block ${className}`}>
      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[#ff7354]">
        Evento que administrás
      </span>
      <select
        value={currentEventId ?? ""}
        disabled={busy}
        onChange={(e) => void change(e.target.value)}
        className="mt-1 h-11 w-full min-w-[200px] border border-white/15 bg-white/[0.04] px-3 text-sm font-bold text-white outline-none transition focus:border-[#ff5a2a]/50 disabled:opacity-50"
      >
        {events.map((event) => (
          <option key={event.id} value={event.id} className="bg-black">
            {event.name}
          </option>
        ))}
      </select>
    </label>
  );
}
