import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

  const admin = createAdminClient();

  const { data: member } = await admin
    .from("organization_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "bartender")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!member) return NextResponse.json({ error: "Tu cuenta no tiene acceso activo a la barra." }, { status: 403 });

  const { data: staff } = await admin
    .from("event_staff")
    .select("event_id, bar_id")
    .eq("organization_member_id", member.id)
    .eq("staff_role", "bartender")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (!staff || !staff.bar_id) return NextResponse.json({ error: "No tenés ninguna barra asignada." }, { status: 403 });

  const [{ data: event }, { data: bar }, { data: tables }, { data: eventProducts }, { data: barStock }] = await Promise.all([
    admin.from("events").select("id, name").eq("id", staff.event_id).maybeSingle(),
    admin.from("bars").select("id, name").eq("id", staff.bar_id).maybeSingle(),
    admin.from("bar_tables").select("id, name, status").eq("event_id", staff.event_id).order("name"),
    admin
      .from("event_products")
      .select("id, product_id, sale_price_minor")
      .eq("event_id", staff.event_id),
    admin.from("bar_stock").select("event_product_id, quantity").eq("bar_id", staff.bar_id),
  ]);

  const stockByEventProduct = new Map((barStock ?? []).map((s) => [s.event_product_id, s.quantity]));
  const productIds = (eventProducts ?? []).map((ep) => ep.product_id);
  const { data: products } = productIds.length
    ? await admin.from("products").select("id, name, category").in("id", productIds)
    : { data: [] as { id: string; name: string; category: string }[] };
  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  const drinks = (eventProducts ?? [])
    .map((ep) => ({
      eventProductId: ep.id,
      name: productById.get(ep.product_id)?.name ?? "Producto",
      salePriceMinor: Number(ep.sale_price_minor),
      stock: stockByEventProduct.get(ep.id) ?? 0,
    }))
    .filter((d) => d.stock > 0);

  return NextResponse.json({
    ok: true,
    event: event ?? null,
    bar: bar ?? null,
    tables: tables ?? [],
    drinks,
  });
}
