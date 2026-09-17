import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyOrganizerForEvent } from "../../../../lib/stock/auth";

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "Falta el evento." }, { status: 400 });

  const verification = await verifyOrganizerForEvent(eventId);
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const admin = createAdminClient();

  const [barsResult, eventProductsResult, tablesResult, barSalesResult, movementsResult, membersResult, staffResult] =
    await Promise.all([
      admin.from("bars").select("id, name, created_at").eq("event_id", eventId).order("created_at"),
      admin
        .from("event_products")
        .select("id, product_id, cost_price_minor, sale_price_minor, profit_margin_percent, total_stock, low_stock_threshold")
        .eq("event_id", eventId),
      admin.from("bar_tables").select("id, name, capacity, price_minor, status").eq("event_id", eventId).order("name"),
      admin
        .from("bar_sales")
        .select("id, bar_id, event_product_id, quantity, unit_price_minor, total_minor, payment_method, created_at, table_id, bartender_member_id")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("stock_movements")
        .select("id, event_product_id, bar_id, type, quantity, reason, actor_user_id, created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(80),
      admin
        .from("organization_members")
        .select("id, user_id, status")
        .eq("organization_id", verification.organizationId)
        .eq("role", "bartender"),
      admin.from("event_staff").select("organization_member_id, bar_id, active").eq("event_id", eventId).eq("staff_role", "bartender"),
    ]);

  const queryError =
    barsResult.error || eventProductsResult.error || tablesResult.error || barSalesResult.error ||
    movementsResult.error || membersResult.error || staffResult.error;
  if (queryError) {
    console.error("STOCK OVERVIEW:", queryError);
    return NextResponse.json({ error: "No se pudo cargar el stock." }, { status: 500 });
  }

  // cancelled_at/cancel_reason (bar_sales) y las ventas de mesa son mas
  // nuevas que el resto de esta ruta -- si todavia no corrio esa migracion,
  // el panel de stock sigue funcionando igual que antes en vez de romperse.
  const barSaleIds = (barSalesResult.data ?? []).map((s) => s.id);
  const [cancelInfoResult, mesaSalesResult] = await Promise.all([
    barSaleIds.length
      ? admin.from("bar_sales").select("id, cancelled_at, cancel_reason").in("id", barSaleIds)
      : Promise.resolve({ data: [] as { id: string; cancelled_at: string | null; cancel_reason: string | null }[], error: null }),
    admin
      .from("sales")
      .select("id, table_id, buyer_id, total_minor, status, payment_method, created_at")
      .eq("event_id", eventId)
      .eq("channel", "mesa")
      .order("created_at", { ascending: false }),
  ]);
  if (cancelInfoResult.error) console.error("STOCK OVERVIEW (cancelacion de ventas de barra, no bloqueante):", cancelInfoResult.error);
  if (mesaSalesResult.error) console.error("STOCK OVERVIEW (ventas de mesa, no bloqueante):", mesaSalesResult.error);
  const cancelInfoById = new Map((cancelInfoResult.data ?? []).map((c) => [c.id, c]));

  const productIds = (eventProductsResult.data ?? []).map((ep) => ep.product_id);
  const eventProductIds = (eventProductsResult.data ?? []).map((ep) => ep.id);

  const [{ data: products }, { data: barStockRows }] = await Promise.all([
    productIds.length
      ? admin.from("products").select("id, name, category, brand, image_path, organization_id").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string; category: string; brand: string | null; image_path: string | null; organization_id: string | null }[] }),
    eventProductIds.length
      ? admin.from("bar_stock").select("bar_id, event_product_id, quantity").in("event_product_id", eventProductIds)
      : Promise.resolve({ data: [] as { bar_id: string; event_product_id: string; quantity: number }[] }),
  ]);
  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  const bartenderUserIds = (membersResult.data ?? []).map((m) => m.user_id);
  const { data: profiles } = bartenderUserIds.length
    ? await admin.from("profiles").select("id, first_name, last_name").in("id", bartenderUserIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const staffByMemberId = new Map((staffResult.data ?? []).map((s) => [s.organization_member_id, s]));
  const memberById = new Map((membersResult.data ?? []).map((m) => [m.id, m]));
  const tableById = new Map((tablesResult.data ?? []).map((t) => [t.id, t]));

  const buyerIds = (mesaSalesResult.data ?? []).map((s) => s.buyer_id).filter((id): id is string => Boolean(id));
  const { data: buyers } = buyerIds.length
    ? await admin.from("buyers").select("id, first_name, last_name").in("id", buyerIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] };
  const buyerById = new Map((buyers ?? []).map((b) => [b.id, b]));

  return NextResponse.json({
    ok: true,
    bars: barsResult.data ?? [],
    eventProducts: (eventProductsResult.data ?? []).map((ep) => ({ ...ep, product: productById.get(ep.product_id) ?? null })),
    barStock: barStockRows ?? [],
    tables: tablesResult.data ?? [],
    recentSales: (barSalesResult.data ?? []).map((sale) => {
      const member = memberById.get(sale.bartender_member_id);
      const profile = member ? profileById.get(member.user_id) : null;
      const cancelInfo = cancelInfoById.get(sale.id);
      return {
        ...sale,
        bartenderName: profile ? `${profile.first_name} ${profile.last_name}`.trim() : "Bartender",
        tableName: sale.table_id ? tableById.get(sale.table_id)?.name ?? "Mesa" : "Barra / mostrador",
        cancelled_at: cancelInfo?.cancelled_at ?? null,
        cancel_reason: cancelInfo?.cancel_reason ?? null,
      };
    }),
    movements: movementsResult.data ?? [],
    mesaSales: (mesaSalesResult.data ?? []).map((sale) => {
      const buyer = sale.buyer_id ? buyerById.get(sale.buyer_id) : null;
      return {
        ...sale,
        tableName: sale.table_id ? tableById.get(sale.table_id)?.name ?? "Mesa" : "—",
        buyerName: buyer ? `${buyer.first_name} ${buyer.last_name}`.trim() : "—",
      };
    }),
    bartenders: (membersResult.data ?? []).map((m) => {
      const staff = staffByMemberId.get(m.id);
      const profile = profileById.get(m.user_id);
      return {
        memberId: m.id,
        firstName: profile?.first_name ?? "Bartender",
        lastName: profile?.last_name ?? "",
        active: m.status === "active" && Boolean(staff?.active),
        barId: staff?.bar_id ?? null,
      };
    }),
  });
}
