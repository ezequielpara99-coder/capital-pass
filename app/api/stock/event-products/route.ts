import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyOrganizerForEvent } from "../../../../lib/stock/auth";

type Body = {
  eventId?: string;
  productId?: string;
  costPriceMinor?: number;
  salePriceMinor?: number;
  profitMarginPercent?: number;
  totalStock?: number;
  lowStockThreshold?: number;
};

// Agrega un producto del catalogo al evento con su costo, precio y stock
// total comprado, o actualiza esos valores si ya estaba cargado.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body;
    const eventId = body.eventId?.trim();
    const productId = body.productId?.trim();

    if (!eventId || !productId) {
      return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
    }

    const verification = await verifyOrganizerForEvent(eventId);
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const costPriceMinor = Math.max(0, Math.round(Number(body.costPriceMinor ?? 0)));
    const salePriceMinor = Math.max(0, Math.round(Number(body.salePriceMinor ?? 0)));
    const profitMarginPercent = Math.max(0, Number(body.profitMarginPercent ?? 0));
    const totalStock = Math.max(0, Math.round(Number(body.totalStock ?? 0)));
    const lowStockThreshold = Math.max(0, Math.round(Number(body.lowStockThreshold ?? 5)));

    const admin = createAdminClient();
    const { data: eventProduct, error } = await admin
      .from("event_products")
      .upsert(
        {
          event_id: eventId,
          product_id: productId,
          cost_price_minor: costPriceMinor,
          sale_price_minor: salePriceMinor,
          profit_margin_percent: profitMarginPercent,
          total_stock: totalStock,
          low_stock_threshold: lowStockThreshold,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "event_id,product_id" }
      )
      .select("id")
      .single();

    if (error || !eventProduct) {
      console.error("STOCK: no se pudo guardar event_product.", error);
      return NextResponse.json({ error: "No se pudo guardar el producto." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, eventProductId: eventProduct.id });
  } catch (error) {
    console.error("STOCK: error inesperado en event-products.", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
