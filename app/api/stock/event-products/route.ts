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

    const admin = createAdminClient();

    // El producto tiene que ser del catalogo global (organization_id null)
    // o del catalogo propio de esta organizacion -- si no, cualquiera que
    // conozca el UUID de un producto privado de otra organizacion podria
    // asociarlo a su propio evento y filtrar su nombre/marca/imagen via
    // GET /api/stock/overview.
    const { data: product } = await admin
      .from("products")
      .select("id, organization_id")
      .eq("id", productId)
      .maybeSingle();

    if (!product || (product.organization_id && product.organization_id !== verification.organizationId)) {
      return NextResponse.json({ error: "El producto no existe en tu catálogo." }, { status: 404 });
    }

    const costPriceMinor = Math.max(0, Math.round(Number(body.costPriceMinor ?? 0)));
    const salePriceMinor = Math.max(0, Math.round(Number(body.salePriceMinor ?? 0)));
    const profitMarginPercent = Math.max(0, Number(body.profitMarginPercent ?? 0));
    const totalStock = Math.max(0, Math.round(Number(body.totalStock ?? 0)));
    const lowStockThreshold = Math.max(0, Math.round(Number(body.lowStockThreshold ?? 5)));

    // Chequeo de "no bajes de lo ya repartido en barras" + guardado en una
    // sola funcion con lock (cp_upsert_event_product): antes eran dos
    // consultas separadas sin ningun lock, y una baja de total_stock a la
    // vez que se asignaba stock a una barra podian pasar sus chequeos
    // juntas y dejar mas repartido en barras que el total comprado.
    const { data: eventProductId, error } = await admin.rpc("cp_upsert_event_product", {
      p_event_id: eventId,
      p_product_id: productId,
      p_cost_price_minor: costPriceMinor,
      p_sale_price_minor: salePriceMinor,
      p_profit_margin_percent: profitMarginPercent,
      p_total_stock: totalStock,
      p_low_stock_threshold: lowStockThreshold,
    });

    if (error || !eventProductId) {
      const message = error?.message ?? "";
      if (/no podés bajar/i.test(message)) return NextResponse.json({ error: message }, { status: 400 });
      console.error("STOCK: no se pudo guardar event_product.", error);
      return NextResponse.json({ error: "No se pudo guardar el producto." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, eventProductId });
  } catch (error) {
    console.error("STOCK: error inesperado en event-products.", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
