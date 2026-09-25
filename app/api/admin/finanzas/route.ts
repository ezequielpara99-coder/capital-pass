import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { isMissingTable, verifyAdmin } from "../../../../lib/quotes/auth";
import { computeTotals, DiscountType, PriceMode, QuoteItem, QuoteKind, QuoteStatus } from "../../../../lib/quotes/totals";

// Resumen de finanzas: presupuestado / facturado / cobrado / pendiente /
// gastos / resultado, sobre lo que ya existe en quotes + lo nuevo
// (quote_payments, expenses). No inventa un estado nuevo: "facturado" es
// a_pagar/aceptado (presupuesto confirmado), "cobrado" es lo que ya se
// registró como pago contra un presupuesto facturado.
export async function GET(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const admin = createAdminClient();

    const { data: quotesData, error: quotesError } = await admin
      .from("quotes")
      .select("id, status, kind, items, price_mode, package_price_minor, discount_type, discount_value, created_at");

    if (quotesError) {
      if (isMissingTable(quotesError)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (presupuestos)." }, { status: 503 });
      console.error("FINANZAS QUOTES:", quotesError);
      return NextResponse.json({ error: "No se pudieron cargar los presupuestos." }, { status: 500 });
    }

    const quotes = (quotesData ?? []) as {
      id: string;
      status: QuoteStatus;
      kind: QuoteKind;
      items: QuoteItem[];
      price_mode: PriceMode;
      package_price_minor: number | string;
      discount_type: DiscountType;
      discount_value: number | string;
      created_at: string;
    }[];

    const quoteTotal = (quote: (typeof quotes)[number]) =>
      computeTotals(
        quote.items ?? [],
        quote.discount_type,
        Number(quote.discount_value),
        quote.price_mode === "package" ? Number(quote.package_price_minor) : null
      ).total;

    const presupuestado = quotes.filter((q) => q.status !== "rechazado").reduce((sum, q) => sum + quoteTotal(q), 0);
    const facturadas = quotes.filter((q) => q.status === "a_pagar" || q.status === "aceptado");
    const facturado = facturadas.reduce((sum, q) => sum + quoteTotal(q), 0);
    const facturadoIds = new Set(facturadas.map((q) => q.id));

    let paymentsQuery = admin.from("quote_payments").select("quote_id, amount_minor, paid_at");
    if (from) paymentsQuery = paymentsQuery.gte("paid_at", from);
    if (to) paymentsQuery = paymentsQuery.lte("paid_at", to);
    const { data: paymentsData, error: paymentsError } = await paymentsQuery;

    if (paymentsError) {
      if (isMissingTable(paymentsError)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (finanzas)." }, { status: 503 });
      console.error("FINANZAS PAGOS:", paymentsError);
      return NextResponse.json({ error: "No se pudieron cargar los pagos." }, { status: 500 });
    }

    const cobrado = (paymentsData ?? [])
      .filter((p) => facturadoIds.has(p.quote_id))
      .reduce((sum, p) => sum + Number(p.amount_minor), 0);

    let expensesQuery = admin.from("expenses").select("amount_minor, expense_date, kind");
    if (from) expensesQuery = expensesQuery.gte("expense_date", from);
    if (to) expensesQuery = expensesQuery.lte("expense_date", to);
    const { data: expensesData, error: expensesError } = await expensesQuery;

    if (expensesError) {
      if (isMissingTable(expensesError)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (finanzas)." }, { status: 503 });
      console.error("FINANZAS GASTOS:", expensesError);
      return NextResponse.json({ error: "No se pudieron cargar los gastos." }, { status: 500 });
    }

    const gastos = (expensesData ?? []).reduce((sum, e) => sum + Number(e.amount_minor), 0);
    const pendiente = Math.max(0, facturado - cobrado);
    const resultado = cobrado - gastos;

    return NextResponse.json({
      ok: true,
      summary: { presupuestado, facturado, cobrado, pendiente, gastos, resultado },
    });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
