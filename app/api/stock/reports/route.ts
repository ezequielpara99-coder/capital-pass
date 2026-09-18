import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyOrganizerForEvent } from "../../../../lib/stock/auth";

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "Falta el evento." }, { status: 400 });

  const verification = await verifyOrganizerForEvent(eventId);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const admin = createAdminClient();

  const [barSalesResult, barsResult, eventProductsResult, mesaSalesResult] = await Promise.all([
    admin
      .from("bar_sales")
      .select("bar_id, event_product_id, quantity, total_minor, payment_method")
      .eq("event_id", eventId)
      .is("cancelled_at", null),
    admin.from("bars").select("id, name").eq("event_id", eventId),
    admin.from("event_products").select("id, product_id").eq("event_id", eventId),
    admin
      .from("sales")
      .select("total_minor, payment_method")
      .eq("event_id", eventId)
      .eq("channel", "mesa")
      .neq("status", "cancelled"),
  ]);

  const queryError = barSalesResult.error || barsResult.error || eventProductsResult.error || mesaSalesResult.error;
  if (queryError) {
    console.error("STOCK REPORTS:", queryError);
    return NextResponse.json({ error: "No se pudo cargar el reporte." }, { status: 500 });
  }

  const barSales = barSalesResult.data;
  const bars = barsResult.data;
  const eventProducts = eventProductsResult.data;
  const mesaSales = mesaSalesResult.data;

  const productIds = (eventProducts ?? []).map((ep) => ep.product_id);
  const { data: products } = productIds.length
    ? await admin.from("products").select("id, name").in("id", productIds)
    : { data: [] as { id: string; name: string }[] };
  const productNameByEventProductId = new Map(
    (eventProducts ?? []).map((ep) => [ep.id, (products ?? []).find((p) => p.id === ep.product_id)?.name ?? "Producto"])
  );
  const barNameById = new Map((bars ?? []).map((b) => [b.id, b.name]));

  const byProduct = new Map<string, { name: string; quantity: number; totalMinor: number }>();
  const byBar = new Map<string, { name: string; quantity: number; totalMinor: number }>();
  const byPaymentMethod = new Map<string, number>();
  let barTotalMinor = 0;
  let comboValueMinor = 0;

  for (const sale of barSales ?? []) {
    // Un canje de combo no es plata que entro a la barra -- ya se cobro
    // cuando se vendio la entrada. Se cuenta la cantidad consumida (sigue
    // siendo stock real que salio), pero no se suma a la plata recaudada.
    const isCombo = sale.payment_method === "combo";
    const saleMoney = isCombo ? 0 : sale.total_minor;

    const productName = productNameByEventProductId.get(sale.event_product_id) ?? "Producto";
    const productRow = byProduct.get(sale.event_product_id) ?? { name: productName, quantity: 0, totalMinor: 0 };
    productRow.quantity += sale.quantity;
    productRow.totalMinor += saleMoney;
    byProduct.set(sale.event_product_id, productRow);

    const barName = barNameById.get(sale.bar_id) ?? "Barra";
    const barRow = byBar.get(sale.bar_id) ?? { name: barName, quantity: 0, totalMinor: 0 };
    barRow.quantity += sale.quantity;
    barRow.totalMinor += saleMoney;
    byBar.set(sale.bar_id, barRow);

    byPaymentMethod.set(sale.payment_method, (byPaymentMethod.get(sale.payment_method) ?? 0) + sale.total_minor);
    barTotalMinor += saleMoney;
    if (isCombo) comboValueMinor += sale.total_minor;
  }

  let mesaTotalMinor = 0;
  for (const sale of mesaSales ?? []) {
    byPaymentMethod.set(sale.payment_method, (byPaymentMethod.get(sale.payment_method) ?? 0) + sale.total_minor);
    mesaTotalMinor += sale.total_minor;
  }

  return NextResponse.json({
    ok: true,
    topProducts: Array.from(byProduct.values()).sort((a, b) => b.quantity - a.quantity),
    byBar: Array.from(byBar.values()).sort((a, b) => b.totalMinor - a.totalMinor),
    byPaymentMethod: Array.from(byPaymentMethod.entries()).map(([method, totalMinor]) => ({ method, totalMinor })),
    barTotalMinor,
    comboValueMinor,
    mesaTotalMinor,
  });
}
