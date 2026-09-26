import { createAdminClient } from "../supabase/admin";
import { isMissingTable } from "../quotes/auth";
import { computeTotals, DiscountType, PriceMode, QuoteItem, QuoteKind } from "../quotes/totals";

type Admin = ReturnType<typeof createAdminClient>;

export type PendingCollection = {
  id: string;
  number: number;
  kind: QuoteKind;
  clientName: string;
  total: number;
  cobrado: number;
  pendiente: number;
  updatedAt: string;
};

// Centro de cobros: cada presupuesto facturado (a_pagar/aceptado) que
// todavia tiene saldo pendiente. Extraido de /api/admin/finanzas/cobros
// para reusarlo tambien en el cron de recordatorio de cobros.
export async function computePendingCollections(admin: Admin): Promise<PendingCollection[] | { error: "missing_table" }> {
  const { data: quotesData, error: quotesError } = await admin
    .from("quotes")
    .select("id, number, kind, client_name, items, price_mode, package_price_minor, discount_type, discount_value, updated_at")
    .in("status", ["a_pagar", "aceptado"]);

  if (quotesError) {
    if (isMissingTable(quotesError)) return { error: "missing_table" };
    throw quotesError;
  }

  const quotes = (quotesData ?? []) as {
    id: string;
    number: number;
    kind: QuoteKind;
    client_name: string;
    items: QuoteItem[];
    price_mode: PriceMode;
    package_price_minor: number | string;
    discount_type: DiscountType;
    discount_value: number | string;
    updated_at: string;
  }[];

  if (quotes.length === 0) return [];

  const { data: paymentsData, error: paymentsError } = await admin
    .from("quote_payments")
    .select("quote_id, amount_minor")
    .in("quote_id", quotes.map((q) => q.id));

  if (paymentsError) {
    if (isMissingTable(paymentsError)) return { error: "missing_table" };
    throw paymentsError;
  }

  const cobradoPorQuote = new Map<string, number>();
  for (const payment of paymentsData ?? []) {
    cobradoPorQuote.set(payment.quote_id, (cobradoPorQuote.get(payment.quote_id) ?? 0) + Number(payment.amount_minor));
  }

  return quotes
    .map((quote) => {
      const total = computeTotals(
        quote.items ?? [],
        quote.discount_type,
        Number(quote.discount_value),
        quote.price_mode === "package" ? Number(quote.package_price_minor) : null
      ).total;
      const cobrado = cobradoPorQuote.get(quote.id) ?? 0;
      return {
        id: quote.id,
        number: quote.number,
        kind: quote.kind,
        clientName: quote.client_name,
        total,
        cobrado,
        pendiente: Math.max(0, total - cobrado),
        updatedAt: quote.updated_at,
      };
    })
    .filter((row) => row.pendiente > 0)
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
}
