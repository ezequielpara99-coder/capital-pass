import { NextRequest, NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { createTicketPublicPath } from "../../../../../lib/tickets/signature";
import { ticketQrPngBuffer } from "../../../../../lib/tickets/qr-image";
import { sendTicketDelivery } from "../../../../../lib/email/ticket-delivery";
import { getAppBaseUrl } from "../../../../../lib/mercadopago/server";

// Manda por mail el/los QR de una venta ya confirmada (puerta, RRPP o
// mesa vendida por el organizador). Es un agregado best-effort al envío
// por WhatsApp que ya existe -- si el comprador no cargó email, o Resend
// no está configurado, o algo falla, se responde ok igual (nunca debe
// poder revertir ni bloquear una venta ya hecha).
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ saleId: string }> }
) {
  try {
    const { saleId } = await context.params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: sale } = await admin
      .from("sales")
      .select("id, event_id, buyer_id, seller_member_id, organization_id, channel, status")
      .eq("id", saleId)
      .maybeSingle();

    if (!sale) {
      return NextResponse.json({ error: "No se encontró la venta." }, { status: 404 });
    }

    // El vendedor de esa venta puntual, o cualquier organizador activo de
    // la organización dueña -- mismo criterio que ya usan las rutas de
    // "entradas" de puerta/RRPP, pero sin atarse a un solo rol: esto lo
    // llaman puerta, RRPP y (más adelante) el organizador vendiendo.
    const { data: memberships } = await supabase
      .from("organization_members")
      .select("id, organization_id, role")
      .eq("user_id", user.id)
      .eq("status", "active");

    const isSeller = (memberships ?? []).some((m) => m.id === sale.seller_member_id);
    const isOrganizer = (memberships ?? []).some(
      (m) => m.role === "organizer" && m.organization_id === sale.organization_id
    );

    if (!isSeller && !isOrganizer) {
      return NextResponse.json({ error: "No tenés acceso a esta venta." }, { status: 403 });
    }

    const { data: buyer } = await admin
      .from("buyers")
      .select("first_name, last_name, email")
      .eq("id", sale.buyer_id)
      .maybeSingle();

    const email = buyer?.email?.trim();
    if (!email) {
      // No es un error: la mayoría de las ventas en persona todavía no
      // cargan email (es opcional). Nada que mandar.
      return NextResponse.json({ ok: true, skipped: true });
    }

    const { data: event } = await admin
      .from("events")
      .select("name")
      .eq("id", sale.event_id)
      .maybeSingle();

    const { data: tickets } = await admin
      .from("tickets")
      .select("id, manual_code, ticket_type_id, status")
      .eq("sale_id", sale.id)
      .eq("status", "issued")
      .order("display_number", { ascending: true });

    if (!tickets || tickets.length === 0) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const typeIds = [...new Set(tickets.map((t) => t.ticket_type_id).filter(Boolean))];
    let typeNames = new Map<string, string>();
    if (typeIds.length > 0) {
      const { data: types } = await admin.from("ticket_types").select("id, name").in("id", typeIds);
      typeNames = new Map((types ?? []).map((t) => [t.id, t.name]));
    }

    const baseUrl = getAppBaseUrl();

    const ticketsForEmail = await Promise.all(
      tickets.map(async (ticket) => ({
        ticketId: ticket.id,
        ticketType: typeNames.get(ticket.ticket_type_id) ?? "Entrada",
        manualCode: ticket.manual_code,
        qrPngBase64: (await ticketQrPngBuffer(ticket.id)).toString("base64"),
        publicUrl: `${baseUrl}${createTicketPublicPath(ticket.id)}`,
      }))
    );

    const result = await sendTicketDelivery({
      to: email,
      buyerName: `${buyer?.first_name ?? ""} ${buyer?.last_name ?? ""}`.trim(),
      eventName: event?.name ?? "tu evento",
      tickets: ticketsForEmail,
    });

    if (!result.ok && !result.skipped) {
      console.error("ENVIAR ENTRADA POR EMAIL:", result.error);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("ERROR API ENVIAR EMAIL:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
