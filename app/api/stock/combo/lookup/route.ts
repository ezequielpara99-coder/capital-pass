import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";

// Busca una entrada por su codigo (el mismo que usa la puerta) y muestra
// que tiene incluido y cuanto le queda, SIN canjear nada todavia -- es
// solo la vista previa antes de que el bartender elija que entregar.
export async function GET(request: NextRequest) {
  const manualCode = request.nextUrl.searchParams.get("code")?.trim();
  if (!manualCode) return NextResponse.json({ error: "Falta el código." }, { status: 400 });

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

  const { data: ticket, error: ticketError } = await admin
    .from("tickets")
    .select("id, status, combo_remaining_quantity, combo_remaining_credit_minor, sale_id, ticket_types(name, combo_type, combo_event_product_id)")
    .eq("event_id", staff.event_id)
    .ilike("manual_code", manualCode)
    .maybeSingle();

  if (ticketError) console.error("COMBO LOOKUP ticket query:", ticketError);
  if (!ticket) return NextResponse.json({ error: "No se encontró ninguna entrada con ese código." }, { status: 404 });

  const ticketType = Array.isArray(ticket.ticket_types) ? ticket.ticket_types[0] : ticket.ticket_types;
  if (!ticketType || !ticketType.combo_type) {
    return NextResponse.json({ error: "Esta entrada no incluye consumición." }, { status: 400 });
  }
  if (ticket.status === "cancelled") {
    return NextResponse.json({ error: "Esta entrada fue anulada." }, { status: 400 });
  }

  const { data: sale } = await admin.from("sales").select("buyer_id").eq("id", ticket.sale_id).maybeSingle();
  const { data: buyer } = sale?.buyer_id
    ? await admin.from("buyers").select("first_name, last_name").eq("id", sale.buyer_id).maybeSingle()
    : { data: null };

  let includedProductName: string | null = null;
  if (ticketType.combo_type === "producto" && ticketType.combo_event_product_id) {
    const { data: ep } = await admin
      .from("event_products")
      .select("product_id")
      .eq("id", ticketType.combo_event_product_id)
      .maybeSingle();
    if (ep) {
      const { data: product } = await admin.from("products").select("name").eq("id", ep.product_id).maybeSingle();
      includedProductName = product?.name ?? null;
    }
  }

  return NextResponse.json({
    ok: true,
    ticket: {
      id: ticket.id,
      buyerName: buyer ? `${buyer.first_name} ${buyer.last_name}`.trim() : "Comprador",
      ticketTypeName: ticketType.name,
      comboType: ticketType.combo_type as "producto" | "credito",
      comboEventProductId: ticketType.combo_event_product_id,
      includedProductName,
      remainingQuantity: ticket.combo_remaining_quantity,
      remainingCreditMinor: ticket.combo_remaining_credit_minor,
    },
  });
}
