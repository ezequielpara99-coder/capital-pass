import { test } from "node:test";
import assert from "node:assert/strict";
import { itemInPesos, summarizeMonth, effectiveDay, type FixedItem, type DollarRates } from "../lib/finanzas/fixed";

const rates: DollarRates = { oficial: 1540, blue: 1545, mep: 1537.9, tarjeta: 2002, updatedAt: null };
const item = (over: Partial<FixedItem>): FixedItem => ({
  id: "x", scope: "personal", kind: "gasto", name: "x", category: "Otros", amount: 100, currency: "ARS", dollar_type: "tarjeta", iva_exterior: false, day_of_month: null, active: true, notes: null, ...over,
});

test("cuentas del mes: dolares al dolar elegido y el IVA 21% sobre el oficial", () => {
  // Claude US$20 con dolar tarjeta + IVA de servicio digital
  assert.deepEqual(itemInPesos(item({ amount: 20, currency: "USD", iva_exterior: true }), rates), { base: 40040, iva: 6468, total: 46508, rate: 2002 });
  assert.equal(itemInPesos(item({ amount: 10, currency: "USD", dollar_type: "blue" }), rates)?.total, 15450);
  // En pesos con IVA
  assert.equal(itemInPesos(item({ amount: 1000, iva_exterior: true }), rates)?.total, 1210);
  // Sin cotizacion, los dolares no se inventan
  assert.equal(itemInPesos(item({ amount: 20, currency: "USD" }), null), null);
  assert.equal(itemInPesos(item({ amount: 500 }), null)?.total, 500);
});

test("cuentas del mes: resumen con lo que ya se pago segun el dia, pausados afuera", () => {
  const items = [
    item({ kind: "ingreso", amount: 500000, day_of_month: 5 }),
    item({ kind: "gasto", amount: 100000, day_of_month: 1 }),
    item({ kind: "gasto", amount: 20, currency: "USD", day_of_month: 31 }),
    item({ kind: "gasto", amount: 99999, day_of_month: 2, active: false }),
  ];
  const summary = summarizeMonth(items, rates, { day: 15, daysInMonth: 30 });
  assert.equal(summary.ingresos, 500000);
  assert.equal(summary.ingresadoHastaHoy, 500000);
  assert.equal(summary.gastos, 100000 + 40040);
  assert.equal(summary.gastadoHastaHoy, 100000);
  assert.equal(summary.faltaPagar, 40040);
  assert.equal(summary.resultado, 500000 - 140040);
  assert.equal(effectiveDay(31, 30), 30);
  assert.equal(summarizeMonth(items, null, { day: 15, daysInMonth: 30 }).sinCotizacion, 1);
});
