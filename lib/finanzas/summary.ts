import { createAdminClient } from "../supabase/admin";
import { isMissingTable } from "../quotes/auth";
import { computeTotals, DiscountType, PriceMode, QuoteItem, QuoteKind, QuoteStatus } from "../quotes/totals";

type Admin = ReturnType<typeof createAdminClient>;

export type FinanzasSummary = { presupuestado: number; facturado: number; cobrado: number; pendiente: number; gastos: number; resultado: number };
export type FinanzasByClient = { clientName: string; facturado: number; cobrado: number; pendiente: number; quotes: number };
export type FinanzasByKind = { kind: QuoteKind; facturado: number; cobrado: number; pendiente: number };
export type FinanzasResult = { summary: FinanzasSummary; byClient: FinanzasByClient[]; byKind: FinanzasByKind[] };

type QuoteRow = {
  id: string;
  status: QuoteStatus;
  kind: QuoteKind;
  client_name: string;
  items: QuoteItem[];
  price_mode: PriceMode;
  package_price_minor: number | string;
  discount_type: DiscountType;
  discount_value: number | string;
  created_at: string;
};

// Cuenta presupuestado/facturado/cobrado/pendiente/gastos/resultado, con o
// sin rango de fechas. Con rango, "presupuestado"/"facturado" cuentan los
// presupuestos CREADOS en ese rango (no hay un timestamp de "cuando pasó a
// facturado" -- es la misma aproximación razonable que ya usaba el
// dashboard) y "gastos" usa su propia fecha (expense_date, que sí es
// exacta). Se usa tanto para el dashboard como para el cierre mensual, para
// no duplicar esta cuenta en dos lugares.
export async function computeFinanzasSummary(
  admin: Admin,
  range: { from?: string | null; to?: string | null } = {}
): Promise<FinanzasResult | { error: "missing_table" }> {
  const { from, to } = range;

  // Se trae TODO sin filtrar por fecha en la query -- el filtro se aplica
  // en memoria mas abajo, solo donde corresponde. Es a proposito: un pago
  // puede caer dentro del rango pedido (paid_at) aunque el presupuesto se
  // haya CREADO antes del rango -- si "facturadoIds" (contra el que se
  // matchean los pagos) se armaba solo con los presupuestos creados DENTRO
  // del rango, ese pago se perdia en silencio y "cobrado" quedaba
  // subestimado (bug real: un cierre mensual podia mostrar $0 cobrado por
  // una factura vieja pagada ese mes). "facturadoIds" ahora es siempre el
  // conjunto completo, sin importar el rango.
  const { data: quotesData, error: quotesError } = await admin
    .from("quotes")
    .select("id, status, kind, client_name, items, price_mode, package_price_minor, discount_type, discount_value, created_at");

  if (quotesError) {
    if (isMissingTable(quotesError)) return { error: "missing_table" };
    throw quotesError;
  }

  const allQuotes = (quotesData ?? []) as QuoteRow[];
  const quotes =
    from || to
      ? allQuotes.filter((q) => (!from || q.created_at >= from) && (!to || q.created_at <= `${to} 23:59:59`))
      : allQuotes;

  const quoteTotal = (quote: QuoteRow) =>
    computeTotals(
      quote.items ?? [],
      quote.discount_type,
      Number(quote.discount_value),
      quote.price_mode === "package" ? Number(quote.package_price_minor) : null
    ).total;

  const presupuestado = quotes.filter((q) => q.status !== "rechazado").reduce((sum, q) => sum + quoteTotal(q), 0);
  const facturadas = quotes.filter((q) => q.status === "a_pagar" || q.status === "aceptado");
  const facturado = facturadas.reduce((sum, q) => sum + quoteTotal(q), 0);
  const allFacturadoIds = new Set(allQuotes.filter((q) => q.status === "a_pagar" || q.status === "aceptado").map((q) => q.id));

  let paymentsQuery = admin.from("quote_payments").select("quote_id, amount_minor, paid_at");
  if (from) paymentsQuery = paymentsQuery.gte("paid_at", from);
  if (to) paymentsQuery = paymentsQuery.lte("paid_at", to);
  const { data: paymentsData, error: paymentsError } = await paymentsQuery;

  if (paymentsError) {
    if (isMissingTable(paymentsError)) return { error: "missing_table" };
    throw paymentsError;
  }

  const cobradoPorQuote = new Map<string, number>();
  for (const payment of paymentsData ?? []) {
    if (!allFacturadoIds.has(payment.quote_id)) continue;
    cobradoPorQuote.set(payment.quote_id, (cobradoPorQuote.get(payment.quote_id) ?? 0) + Number(payment.amount_minor));
  }
  const cobrado = [...cobradoPorQuote.values()].reduce((sum, value) => sum + value, 0);

  const byClientMap = new Map<string, { facturado: number; cobrado: number; quotes: number }>();
  for (const quote of facturadas) {
    const key = quote.client_name?.trim() || "Sin nombre";
    const entry = byClientMap.get(key) ?? { facturado: 0, cobrado: 0, quotes: 0 };
    entry.facturado += quoteTotal(quote);
    entry.cobrado += cobradoPorQuote.get(quote.id) ?? 0;
    entry.quotes += 1;
    byClientMap.set(key, entry);
  }
  const byClient: FinanzasByClient[] = [...byClientMap.entries()]
    .map(([clientName, values]) => ({
      clientName,
      facturado: values.facturado,
      cobrado: values.cobrado,
      pendiente: Math.max(0, values.facturado - values.cobrado),
      quotes: values.quotes,
    }))
    .sort((a, b) => b.facturado - a.facturado)
    .slice(0, 100);

  const byKindMap = new Map<QuoteKind, { facturado: number; cobrado: number }>();
  for (const quote of facturadas) {
    const entry = byKindMap.get(quote.kind) ?? { facturado: 0, cobrado: 0 };
    entry.facturado += quoteTotal(quote);
    entry.cobrado += cobradoPorQuote.get(quote.id) ?? 0;
    byKindMap.set(quote.kind, entry);
  }
  const byKind: FinanzasByKind[] = [...byKindMap.entries()].map(([kind, values]) => ({
    kind,
    facturado: values.facturado,
    cobrado: values.cobrado,
    pendiente: Math.max(0, values.facturado - values.cobrado),
  }));

  let expensesQuery = admin.from("expenses").select("amount_minor, expense_date, kind");
  if (from) expensesQuery = expensesQuery.gte("expense_date", from);
  if (to) expensesQuery = expensesQuery.lte("expense_date", to);
  const { data: expensesData, error: expensesError } = await expensesQuery;

  if (expensesError) {
    if (isMissingTable(expensesError)) return { error: "missing_table" };
    throw expensesError;
  }

  const gastos = (expensesData ?? []).reduce((sum, e) => sum + Number(e.amount_minor), 0);
  const pendiente = Math.max(0, facturado - cobrado);
  const resultado = cobrado - gastos;

  return { summary: { presupuestado, facturado, cobrado, pendiente, gastos, resultado }, byClient, byKind };
}
