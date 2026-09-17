import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { sendPushToOrganizers } from "../../../../lib/push/server";

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

    // Notificaciones push al organizador: venta en tiempo real, y stock
    // bajo si esta venta hizo que la barra cruce el umbral de alerta.
    // No debe frenar la respuesta si algo falla acá.
    try {
      const [{ data: bar }, { data: barStock }] = await Promise.all([
        admin.from("bars").select("name, event_id").eq("id", barId).maybeSingle(),
        admin.from("bar_stock").select("quantity").eq("bar_id", barId).eq("event_product_id", eventProductId).maybeSingle(),
      ]);

      if (bar?.event_id) {
        const { data: event } = await admin.from("events").select("organization_id").eq("id", bar.event_id).maybeSingle();
        if (event?.organization_id) {
          const totalMinor = Number(result?.total_minor ?? 0);
          const moneyLabel = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(totalMinor);

          await sendPushToOrganizers(event.organization_id, "bar_sale", {
            title: `🍹 Venta en ${bar.name}`,
            body: `${productName} x${quantity} — ${moneyLabel}`,
            url: "/panel/stock",
          });

          if (barStock && eventProduct) {
            const { data: ep } = await admin.from("event_products").select("low_stock_threshold").eq("id", eventProductId).maybeSingle();
            if (ep && barStock.quantity <= ep.low_stock_threshold) {
              await sendPushToOrganizers(event.organization_id, "low_stock", {
                title: "⚠️ Stock bajo",
                body: `Quedan ${barStock.quantity} de ${productName} en ${bar.name}`,
                url: "/panel/stock",
              });
            }
          }
        }
      }
    } catch (pushError) {
      console.error("PUSH bartender-sale:", pushError);
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
