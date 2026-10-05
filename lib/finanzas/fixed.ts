// Cuentas del mes: calculo de ingresos y gastos fijos en pesos, con la
// cotizacion del dolar del dia y el IVA de servicios del exterior. Sin
// dependencias de servidor: la usan la API y la pantalla.

export type FixedScope = "negocio" | "personal";
export type FixedKind = "ingreso" | "gasto";
export type DollarType = "tarjeta" | "blue" | "mep" | "oficial";

export type FixedItem = {
  id: string;
  scope: FixedScope;
  kind: FixedKind;
  name: string;
  category: string;
  amount: number;
  currency: "ARS" | "USD";
  dollar_type: DollarType;
  iva_exterior: boolean;
  day_of_month: number | null;
  active: boolean;
  notes: string | null;
};

// Cotizacion "venta" de cada dolar (lo que se paga al comprar).
export type DollarRates = { oficial: number; blue: number; mep: number; tarjeta: number; updatedAt: string | null };

export const IVA_EXTERIOR = 0.21;

export const DOLLAR_LABEL: Record<DollarType, string> = {
  tarjeta: "Dólar tarjeta",
  blue: "Dólar blue",
  mep: "Dólar MEP",
  oficial: "Dólar oficial",
};

export type ItemInPesos = { base: number; iva: number; total: number; rate: number | null } | null;

// Monto en pesos de un item fijo. Para dolares: monto x cotizacion elegida
// (el dolar tarjeta ya incluye la percepcion del 30%). El IVA 21% de
// servicios digitales del exterior se calcula sobre el precio al dolar
// OFICIAL, que es como lo cobra la tarjeta. Sin cotizacion disponible,
// devuelve null (no se inventa un numero).
export function itemInPesos(item: Pick<FixedItem, "amount" | "currency" | "dollar_type" | "iva_exterior">, rates: DollarRates | null): ItemInPesos {
  const amount = Number(item.amount);
  if (!Number.isFinite(amount)) return null;
  if (item.currency === "ARS") {
    const iva = item.iva_exterior ? amount * IVA_EXTERIOR : 0;
    return { base: Math.round(amount), iva: Math.round(iva), total: Math.round(amount + iva), rate: null };
  }
  if (!rates) return null;
  const rate = rates[item.dollar_type];
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const base = amount * rate;
  const iva = item.iva_exterior ? amount * rates.oficial * IVA_EXTERIOR : 0;
  return { base: Math.round(base), iva: Math.round(iva), total: Math.round(base + iva), rate };
}

// Dia del mes en que vence/entra un item, ajustado a meses mas cortos (un
// "31" en un mes de 30 dias cae el 30).
export function effectiveDay(day: number | null, daysInMonth: number) {
  if (day === null) return null;
  return Math.min(day, daysInMonth);
}

export type MonthSummary = {
  ingresos: number;
  gastos: number;
  resultado: number;
  // Gastos cuyo dia ya paso este mes (o sin dia cargado no cuentan aca).
  gastadoHastaHoy: number;
  faltaPagar: number;
  ingresadoHastaHoy: number;
  sinCotizacion: number;
};

export function summarizeMonth(items: FixedItem[], rates: DollarRates | null, today: { day: number; daysInMonth: number }): MonthSummary {
  const summary: MonthSummary = { ingresos: 0, gastos: 0, resultado: 0, gastadoHastaHoy: 0, faltaPagar: 0, ingresadoHastaHoy: 0, sinCotizacion: 0 };
  for (const item of items) {
    if (!item.active) continue;
    const pesos = itemInPesos(item, rates);
    if (!pesos) {
      summary.sinCotizacion += 1;
      continue;
    }
    const day = effectiveDay(item.day_of_month, today.daysInMonth);
    const alreadyHappened = day !== null && day <= today.day;
    if (item.kind === "ingreso") {
      summary.ingresos += pesos.total;
      if (alreadyHappened) summary.ingresadoHastaHoy += pesos.total;
    } else {
      summary.gastos += pesos.total;
      if (alreadyHappened) summary.gastadoHastaHoy += pesos.total;
    }
  }
  summary.resultado = summary.ingresos - summary.gastos;
  summary.faltaPagar = summary.gastos - summary.gastadoHastaHoy;
  return summary;
}
