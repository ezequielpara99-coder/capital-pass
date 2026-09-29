// Metas y cierres se miden por mes calendario en horario de Argentina, no
// UTC (Buenos Aires es UTC-3): calcular el "mes actual" con
// getUTCFullYear/getUTCMonth hace que, durante las ultimas horas de cada
// mes en hora local, el sistema ya piense que es el mes siguiente.
const AR_TZ = "America/Argentina/Buenos_Aires";

function arYearMonth(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: AR_TZ, year: "numeric", month: "2-digit" }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  return { year, month };
}

export function currentPeriodAR() {
  const { year, month } = arYearMonth(new Date());
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function currentMonthEndAR() {
  const { year, month } = arYearMonth(new Date());
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function previousMonthPeriodAR() {
  const { year, month } = arYearMonth(new Date());
  const date = new Date(Date.UTC(year, month - 1 - 1, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
