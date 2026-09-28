"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// Reloj compartido: se actualiza cada 30 segundos. En el servidor devuelve 0
// (no se muestra nada) para que el HTML del servidor y el del navegador
// coincidan y no haya errores de hidratacion.
function subscribeClock(callback: () => void) {
  const timer = setInterval(callback, 30000);
  return () => clearInterval(timer);
}
const clockSnapshot = () => Math.floor(Date.now() / 30000);
const serverClock = () => 0;

export function Countdown({ startsAt, endsAt }: { startsAt: string; endsAt: string | null }) {
  const bucket = useSyncExternalStore(subscribeClock, clockSnapshot, serverClock);
  if (bucket === 0) return null;

  const now = bucket * 30000;
  const start = new Date(startsAt).getTime();
  const end = endsAt ? new Date(endsAt).getTime() : start + 6 * 60 * 60 * 1000;

  if (now >= end) return null;

  if (now >= start) {
    return (
      <p className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/[0.08] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-emerald-200">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Sucediendo ahora
      </p>
    );
  }

  const totalMinutes = Math.floor((start - now) / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts =
    days > 0
      ? [`${days} ${days === 1 ? "día" : "días"}`, `${hours} h`]
      : hours > 0
        ? [`${hours} h`, `${minutes} min`]
        : [`${minutes} min`];

  return (
    <p className="inline-flex items-center gap-2 rounded-full border border-[#ff5a2a]/25 bg-[#ff3b24]/[0.09] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[#ffb09a]">
      ⏳ Faltan {parts.join(" ")}
    </p>
  );
}

type ActionsProps = {
  name: string;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  city: string | null;
  description: string | null;
};

const ACTION =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-semibold text-white/75 transition hover:border-[#ff5a2a]/40 hover:text-white";

// yyyymmddThhmmssZ (UTC), el formato que piden Google Calendar y los .ics.
function calendarStamp(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Cómo llegar, agregar al calendario y compartir el evento.
export function EventActions({ name, startsAt, endsAt, venueName, city, description }: ActionsProps) {
  const [copied, setCopied] = useState(false);

  const place = [venueName, city].filter(Boolean).join(", ");
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 6 * 60 * 60 * 1000);

  const mapsUrl = place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : null;

  const googleCalendarUrl =
    "https://calendar.google.com/calendar/render?" +
    new URLSearchParams({
      action: "TEMPLATE",
      text: name,
      dates: `${calendarStamp(start)}/${calendarStamp(end)}`,
      details: (description ?? "").slice(0, 500),
      location: place,
    }).toString();

  function downloadIcs() {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Capital Pass//Evento//ES",
      "BEGIN:VEVENT",
      `UID:${calendarStamp(start)}-${encodeURIComponent(name)}@capitalpass`,
      `DTSTAMP:${calendarStamp(new Date())}`,
      `DTSTART:${calendarStamp(start)}`,
      `DTEND:${calendarStamp(end)}`,
      `SUMMARY:${icsEscape(name)}`,
      `LOCATION:${icsEscape(place)}`,
      `DESCRIPTION:${icsEscape((description ?? "").slice(0, 500))}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name.replace(/[^\w-]+/g, "-").toLowerCase() || "evento"}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function share() {
    const url = window.location.href.split("#")[0];
    const text = `${name} — comprá tu entrada acá:`;
    try {
      if (navigator.share) {
        await navigator.share({ title: name, text, url });
        return;
      }
    } catch {
      return; // el usuario cerró el menú de compartir
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="mt-7 flex flex-wrap gap-2">
      {mapsUrl && (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={ACTION}>
          📍 Cómo llegar
        </a>
      )}
      <a href={googleCalendarUrl} target="_blank" rel="noopener noreferrer" className={ACTION}>
        📅 Google Calendar
      </a>
      <button type="button" onClick={downloadIcs} className={ACTION}>
        ⬇ Guardar en el calendario
      </button>
      <button type="button" onClick={share} className={ACTION}>
        {copied ? "✓ Link copiado" : "↗ Compartir"}
      </button>
    </div>
  );
}

// Boton fijo de compra para el celular: lleva a las entradas y desaparece
// cuando las entradas ya estan a la vista.
export function StickyBuyBar({ label }: { label: string }) {
  const [entriesVisible, setEntriesVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById("entradas");
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setEntriesVisible(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  if (entriesVisible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/85 px-5 py-3 backdrop-blur-xl md:hidden">
      <a
        href="#entradas"
        className="flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] text-sm font-bold text-white shadow-[0_10px_35px_rgba(255,42,26,.3)]"
      >
        {label}
      </a>
    </div>
  );
}
