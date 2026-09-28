// Arranque de un periodo de reportes, en hora de Argentina (UTC-3, sin
// horario de verano): "month" = dia 1 del mes en curso a las 00:00 argentinas.
// El mes calendario ANTERIOR en hora de Argentina: { period: "YYYY-MM", from, to }
// con from inclusivo y to exclusivo (00:00 argentinas = 03:00 UTC).
export function previousMonthRange(now = new Date()) {
  const ar = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const year = ar.getUTCFullYear();
  const month = ar.getUTCMonth(); // mes en curso (0-11)
  const from = new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
  const to = new Date(Date.UTC(year, month, 1, 3, 0, 0));
  const prev = new Date(Date.UTC(year, month - 1, 1));
  const period = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
  return { period, from, to };
}

export function periodStart(period: string) {
  const now = new Date();
  const ar = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  if (period === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (period === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (period === "all") return new Date("2000-01-01T00:00:00Z");
  return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), 1, 3, 0, 0));
}
