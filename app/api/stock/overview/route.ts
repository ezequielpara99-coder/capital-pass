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
        .select("id, bar_id, event_product_id, quantity, total_minor, payment_method, created_at, table_id")
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

  const productIds = (eventProductsResult.data ?? []).map((ep) => ep.product_id);
  const eventProductIds = (eventProductsResult.data ?? []).map((ep) => ep.id);

  const [{ data: products }, { data: barStockRows }] = await Promise.all([
    productIds.length
      ? admin.from("products").select("id, name, category, brand, image_path").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string; category: string; brand: string | null; image_path: string | null }[] }),
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

  return NextResponse.json({
    ok: true,
    bars: barsResult.data ?? [],
    eventProducts: (eventProductsResult.data ?? []).map((ep) => ({ ...ep, product: productById.get(ep.product_id) ?? null })),
    barStock: barStockRows ?? [],
    tables: tablesResult.data ?? [],
    recentSales: barSalesResult.data ?? [],
    movements: movementsResult.data ?? [],
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
