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

  // Sin order by, Postgres no garantiza que fila devuelve si el
  // bartender quedo asignado a mas de un evento activo a la vez --
  // podia devolver un evento/barra distinto al de /api/stock/bartender-context
  // en la misma sesion. Se prioriza la asignacion mas reciente.
  const { data: staff } = await admin
    .from("event_staff")
    .select("event_id, bar_id")
    .eq("organization_member_id", member.id)
    .eq("staff_role", "bartender")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!staff || !staff.bar_id) return NextResponse.json({ error: "No tenés ninguna barra asignada." }, { status: 403 });

  // combo_type/combo_event_product_id se leen del SNAPSHOT de la entrada
  // (tickets), no de la tanda en vivo (ticket_types) -- si el organizador
  // edita el combo de la tanda despues de vender, las entradas ya
  // emitidas tienen que seguir validando contra lo que el comprador
  // realmente pago, no contra la configuracion nueva.
  // Igualdad exacta (mismo criterio que redeem_combo_ticket, que compara
  // upper(manual_code) = codigo) -- antes usaba ilike, que interpreta "%"
  // y "_" como comodines de patron. Un codigo con alguno de esos
  // caracteres (typo, autocorrector, copy-paste con caracteres raros)
  // podia matchear una entrada DISTINTA a la que el bartender tipeo, o
  // devolver un 404 enmascarando una coincidencia ambigua (ilike + error
  // sin chequear tambien caia en el mismo mensaje generico).
  const { data: ticket, error: ticketError } = await admin
    .from("tickets")
    .select("id, status, ticket_type_id, combo_type, combo_event_product_id, combo_remaining_quantity, combo_remaining_credit_minor, sale_id")
    .eq("event_id", staff.event_id)
    .eq("manual_code", manualCode.toUpperCase())
    .maybeSingle();

  if (ticketError) {
    console.error("COMBO LOOKUP:", ticketError);
    return NextResponse.json({ error: "No se pudo buscar la entrada." }, { status: 500 });
  }
  if (!ticket) return NextResponse.json({ error: "No se encontró ninguna entrada con ese código." }, { status: 404 });
  if (!ticket.combo_type) {
    return NextResponse.json({ error: "Esta entrada no incluye consumición." }, { status: 400 });
  }
  if (ticket.status === "cancelled") {
    return NextResponse.json({ error: "Esta entrada fue anulada." }, { status: 400 });
  }

  const { data: ticketType } = await admin
    .from("ticket_types")
    .select("name")
    .eq("id", ticket.ticket_type_id)
    .maybeSingle();

  const { data: sale } = await admin.from("sales").select("buyer_id").eq("id", ticket.sale_id).maybeSingle();
  const { data: buyer } = sale?.buyer_id
    ? await admin.from("buyers").select("first_name, last_name").eq("id", sale.buyer_id).maybeSingle()
    : { data: null };

  let includedProductName: string | null = null;
  if (ticket.combo_type === "producto" && ticket.combo_event_product_id) {
    const { data: ep } = await admin
      .from("event_products")
      .select("product_id")
      .eq("id", ticket.combo_event_product_id)
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
      ticketTypeName: ticketType?.name ?? "Entrada",
      comboType: ticket.combo_type as "producto" | "credito",
      comboEventProductId: ticket.combo_event_product_id,
      includedProductName,
      remainingQuantity: ticket.combo_remaining_quantity,
      remainingCreditMinor: ticket.combo_remaining_credit_minor === null ? null : Number(ticket.combo_remaining_credit_minor),
    },
  });
}
