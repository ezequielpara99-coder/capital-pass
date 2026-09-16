import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const barId = String(body.barId ?? "").trim();
    const tableId = String(body.tableId ?? "").trim() || null;
    const eventProductId = String(body.eventProductId ?? "").trim();
    const quantity = Number(body.quantity);
    const paymentMethod = String(body.paymentMethod ?? "").trim();

    if (!barId || !eventProductId || !Number.isInteger(quantity) || quantity <= 0 || !paymentMethod) {
      return NextResponse.json({ error: "Completá bebida, cantidad y método de pago." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

    const { data, error } = await supabase.rpc("create_bartender_sale", {
      p_bar_id: barId,
      p_table_id: tableId,
      p_event_product_id: eventProductId,
      p_quantity: quantity,
      p_payment_method: paymentMethod,
    });

    if (error) {
      return NextResponse.json({ error: error.message.replace(/^.*?:\s*/, "") || "No se pudo registrar la venta." }, { status: 400 });
    }

    const result = data?.[0];

    // Datos para el recibo (nombre de bebida, mesa, bartender) -- la RPC
    // solo devuelve el id y el total, el resto lo completamos aca.
    const admin = createAdminClient();
    const [{ data: eventProduct }, { data: table }, { data: profile }] = await Promise.all([
      admin.from("event_products").select("product_id").eq("id", eventProductId).maybeSingle(),
      tableId
        ? admin.from("bar_tables").select("name").eq("id", tableId).maybeSingle()
        : Promise.resolve({ data: null as { name: string } | null }),
      admin.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle(),
    ]);

    let productName = "Trago";
    if (eventProduct?.product_id) {
      const { data: product } = await admin.from("products").select("name").eq("id", eventProduct.product_id).maybeSingle();
      productName = product?.name ?? productName;
    }

    return NextResponse.json({
      ok: true,
      receipt: {
        barSaleId: result?.bar_sale_id,
        totalMinor: Number(result?.total_minor ?? 0),
        productName,
        quantity,
        tableName: table?.name ?? "Barra / mostrador",
        bartenderName: profile ? `${profile.first_name} ${profile.last_name}`.trim() : "Bartender",
        paymentMethod,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("ERROR BARTENDER SALE:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
