import { createAdminClient } from "../supabase/admin";
import { isMissingTable } from "../quotes/auth";
import { fetchAllRows } from "../supabase/fetch-all";
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
  const { data: quotesData, error: quotesError } = await fetchAllRows((rangeFrom, rangeTo) =>
    admin
      .from("quotes")
      .select("id, status, kind, client_name, items, price_mode, package_price_minor, discount_type, discount_value, created_at")
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(rangeFrom, rangeTo)
  );

  if (quotesError) {
    if (isMissingTable(quotesError)) return { error: "missing_table" };
    throw quotesError;
  }

  const allQuotes = (quotesData ?? []) as QuoteRow[];
  // Comparacion por STRING (no por fecha real) tenia un bug real: created_at
  // es timestamptz y PostgREST lo devuelve con "T" como separador
  // ("...T22:10:00+00:00"), pero el limite de "hasta" se armaba con un
  // ESPACIO ("2026-08-31 23:59:59") -- 'T' (0x54) es mayor que ' ' (0x20),
  // asi que CUALQUIER hora del ultimo dia del rango quedaba excluida por la
  // comparacion de strings. Un presupuesto creado el 31 a la noche no
  // entraba en el cierre de ese mes ni en el del siguiente: desaparecia de
  // "presupuestado"/"facturado" para siempre. Se compara por timestamp real.
  const fromMs = from ? new Date(from).getTime() : null;
  const toMs = to ? new Date(`${to}T23:59:59.999Z`).getTime() : null;
  const quotes =
    from || to
      ? allQuotes.filter((q) => {
          const t = new Date(q.created_at).getTime();
          return (fromMs === null || t >= fromMs) && (toMs === null || t <= toMs);
        })
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

  const { data: paymentsData, error: paymentsError } = await fetchAllRows((rangeFrom, rangeTo) => {
    let query = admin.from("quote_payments").select("quote_id, amount_minor, paid_at").is("deleted_at", null);
    if (from) query = query.gte("paid_at", from);
    if (to) query = query.lte("paid_at", to);
    return query.order("id", { ascending: true }).range(rangeFrom, rangeTo);
  });

  if (paymentsError) {
    if (isMissingTable(paymentsError)) return { error: "missing_table" };
    throw paymentsError;
  }

  // Un pago solo se pudo haber registrado mientras el presupuesto ESTABA en
  // a_pagar/aceptado (esa es la regla del propio endpoint de pagos) -- asi
  // que se cuenta sin volver a filtrar por el status ACTUAL (cambiar el
  // estado no lo hace desaparecer). Pero SI se descarta si el presupuesto
  // en si ya no existe (se borro): borrar un presupuesto no arrastra sus
  // pagos, y sin este chequeo un pago restaurado desde la papelera mientras
  // el presupuesto sigue borrado inflaba "cobrado"/"resultado" para siempre,
  // sin ningun rastro visible de a que presupuesto pertenecia.
  const activeQuoteIds = new Set(allQuotes.map((q) => q.id));
  const cobradoPorQuote = new Map<string, number>();
  for (const payment of paymentsData ?? []) {
    if (!activeQuoteIds.has(payment.quote_id)) continue;
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

  const { data: expensesData, error: expensesError } = await fetchAllRows((rangeFrom, rangeTo) => {
    let query = admin.from("expenses").select("amount_minor, expense_date, kind").is("deleted_at", null);
    if (from) query = query.gte("expense_date", from);
    if (to) query = query.lte("expense_date", to);
    return query.order("id", { ascending: true }).range(rangeFrom, rangeTo);
  });

  if (expensesError) {
    if (isMissingTable(expensesError)) return { error: "missing_table" };
    throw expensesError;
  }

  const gastos = (expensesData ?? []).reduce((sum, e) => sum + Number(e.amount_minor), 0);
  const pendiente = Math.max(0, facturado - cobrado);
  const resultado = cobrado - gastos;

  return { summary: { presupuestado, facturado, cobrado, pendiente, gastos, resultado }, byClient, byKind };
}
