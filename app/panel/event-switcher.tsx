"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
    <div className="relative z-20 border-b border-white/[0.07] bg-[#0a0807]/80">
      <div className="mx-auto max-w-[1480px] px-5 py-3 md:px-8 xl:px-10">
        <EventSwitcher events={events} currentEventId={currentEventId} className="max-w-[420px]" />
      </div>
    </div>
  );
}

// Selector de "evento que estoy administrando", como un panel desplegable
// (no un <select> nativo) para elegir de forma mas intuitiva. Solo aparece
// si el organizador tiene mas de uno. Guarda la eleccion (cookie) y recarga
// la pantalla sin el parametro eventId de la URL, para que todo el panel
// (datos, ventas, informes) pase a mostrar el evento elegido.
//
// El panel se renderiza en un portal (document.body) con posicion fija:
// varias pantallas lo ponen dentro de tarjetas con "overflow-hidden" (por
// los brillos de fondo), y ahi adentro un dropdown absoluto quedaria
// recortado.
export default function EventSwitcher({
  events,
  currentEventId,
  className = "",
}: {
  events: SwitcherEvent[];
  currentEventId: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function place() {
      const box = buttonRef.current?.getBoundingClientRect();
      if (box) setRect({ left: box.left, top: box.bottom + 6, width: box.width });
    }
    place();

    function onClick(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  if (events.length < 2) return null;

  const current = events.find((event) => event.id === currentEventId) ?? events[0];

  async function change(eventId: string) {
    setOpen(false);
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
    <div className={`relative ${className}`}>
      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-[#ff7354]">Evento que administrás</span>

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={busy}
        aria-expanded={open}
        className="mt-1 flex h-11 w-full items-center justify-between gap-2 border border-white/15 bg-white/[0.04] px-3 text-left text-sm font-bold text-white outline-none transition hover:border-white/30 focus:border-[#ff5a2a]/50 disabled:opacity-50"
      >
        <span className="truncate">{busy ? "Cambiando…" : (current?.name ?? "Elegir evento")}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`shrink-0 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && rect &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", left: rect.left, top: rect.top, width: Math.max(rect.width, 260) }}
            className="z-[600] max-h-[320px] overflow-y-auto border border-white/15 bg-[#0a0807] shadow-[0_20px_60px_rgba(0,0,0,.55)]"
          >
            {events.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => void change(event.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition ${
                  event.id === currentEventId ? "bg-[#ff3b24]/[0.08] font-bold text-white" : "text-white/60 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${event.id === currentEventId ? "bg-[#ff3b24]" : "bg-white/15"}`} />
                <span className="truncate">{event.name}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
