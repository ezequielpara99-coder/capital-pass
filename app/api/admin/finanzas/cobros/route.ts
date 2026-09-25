import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { isMissingTable, verifyAdmin } from "../../../../../lib/quotes/auth";
import { computeTotals, DiscountType, PriceMode, QuoteItem, QuoteKind } from "../../../../../lib/quotes/totals";

// Centro de cobros: cada presupuesto facturado (a_pagar/aceptado) que
// todavia tiene saldo pendiente, para poder reclamarlo. No es un estado
// nuevo -- es la misma cuenta que ya usa el dashboard de /admin/finanzas,
// pero desglosada presupuesto por presupuesto en vez de sumada.
export async function GET() {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const admin = createAdminClient();

    const { data: quotesData, error: quotesError } = await admin
      .from("quotes")
      .select("id, number, kind, client_name, items, price_mode, package_price_minor, discount_type, discount_value, updated_at")
      .in("status", ["a_pagar", "aceptado"]);

    if (quotesError) {
      if (isMissingTable(quotesError)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (presupuestos)." }, { status: 503 });
      console.error("COBROS QUOTES:", quotesError);
      return NextResponse.json({ error: "No se pudieron cargar los presupuestos." }, { status: 500 });
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

    if (quotes.length === 0) return NextResponse.json({ ok: true, pending: [] });

    const { data: paymentsData, error: paymentsError } = await admin
      .from("quote_payments")
      .select("quote_id, amount_minor")
      .in("quote_id", quotes.map((q) => q.id));

    if (paymentsError) {
      if (isMissingTable(paymentsError)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (finanzas)." }, { status: 503 });
      console.error("COBROS PAGOS:", paymentsError);
      return NextResponse.json({ error: "No se pudieron cargar los pagos." }, { status: 500 });
    }

    const cobradoPorQuote = new Map<string, number>();
    for (const payment of paymentsData ?? []) {
      cobradoPorQuote.set(payment.quote_id, (cobradoPorQuote.get(payment.quote_id) ?? 0) + Number(payment.amount_minor));
    }

    const pending = quotes
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

    return NextResponse.json({ ok: true, pending });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
