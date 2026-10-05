// Que evento le corresponde mostrar a alguien del equipo cuando esta
// asignado a varios. La usan RRPP (panel, nueva venta, mesas, colectivo),
// puerta, control de ingreso y bartender.
//
// Antes las pantallas de RRPP tomaban el evento con la fecha MAS VIEJA (un
// RRPP que seguia asignado al evento del mes pasado, ya terminado, vendia
// para ese y la venta se rechazaba), y puerta/control/bartender tomaban la
// asignacion MAS RECIENTE (si el organizador ya habia cargado al equipo
// para el evento del mes que viene, esta noche veian ese y no el de hoy).
//
// Regla: 1) un evento en curso ("active"); 2) si no, el proximo por fecha
// entre los "upcoming"; 3) si no hay ninguno vigente, el mas reciente (para
// que al menos vea sus numeros del ultimo evento).
export type CurrentEventCandidate = { id: string; name: string; starts_at: string | null; status?: string | null };

function time(value: string | null) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function pickCurrentEvent<T extends CurrentEventCandidate>(events: T[], now = Date.now()): T | null {
  if (events.length === 0) return null;

  const active = events.filter((event) => event.status === "active");
  if (active.length > 0) {
    // Si hay mas de uno en curso, el que empezo mas cerca de ahora.
    return [...active].sort((a, b) => Math.abs((time(a.starts_at) ?? now) - now) - Math.abs((time(b.starts_at) ?? now) - now))[0];
  }

  const upcoming = events.filter((event) => event.status === "upcoming");
  if (upcoming.length > 0) {
    // El proximo por fecha; los que ya pasaron (o no tienen fecha) van al final.
    const sorted = [...upcoming].sort((a, b) => {
      const ta = time(a.starts_at);
      const tb = time(b.starts_at);
      const futureA = ta !== null && ta >= now - 12 * 60 * 60 * 1000;
      const futureB = tb !== null && tb >= now - 12 * 60 * 60 * 1000;
      if (futureA !== futureB) return futureA ? -1 : 1;
      if (futureA && futureB) return (ta as number) - (tb as number);
      return (tb ?? 0) - (ta ?? 0);
    });
    return sorted[0];
  }

  const others = events.filter((event) => event.status !== "cancelled" && event.status !== "draft");
  const pool = others.length > 0 ? others : events;
  return [...pool].sort((a, b) => (time(b.starts_at) ?? 0) - (time(a.starts_at) ?? 0))[0];
}
