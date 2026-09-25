import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { createTicketPublicPath } from "../../../../../lib/tickets/signature";

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      saleId: string;
    }>;
  }
) {
  try {
    const { saleId } = await context.params;

    // =====================================================
    // USUARIO
    // =====================================================

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "No hay una sesión válida.",
        },
        {
          status: 401,
        }
      );
    }

    const admin = createAdminClient();

    // =====================================================
    // VENTA
    // =====================================================

    const {
      data: sale,
      error: saleError,
    } = await admin
      .from("sales")
      .select(`
        id,
        event_id,
        buyer_id,
        seller_member_id,
        organization_id,
        channel,
        total_minor,
        status
      `)
      .eq("id", saleId)
      .maybeSingle();

    if (saleError || !sale) {
      return NextResponse.json(
        {
          error: "No se encontró la venta.",
        },
        {
          status: 404,
        }
      );
    }

    // =====================================================
    // PERMISOS: quien vendió esta venta puntual (RRPP u organizador),
    // o cualquier organizador activo de esa organización.
    // =====================================================

    const {
      data: memberships,
      error: membershipError,
    } = await supabase
      .from("organization_members")
      .select("id, role")
      .eq("user_id", user.id)
      .eq("organization_id", sale.organization_id)
      .eq("status", "active");

    if (membershipError) {
      console.error(
        "ERROR MEMBERSHIP VENTAS:",
        membershipError
      );

      return NextResponse.json(
        {
          error: "No se pudo verificar tu cuenta.",
        },
        {
          status: 500,
        }
      );
    }

    const isSeller = (memberships ?? []).some(
      (m) => m.id === sale.seller_member_id
    );

    const isOrganizer = (memberships ?? []).some(
      (m) => m.role === "organizer"
    );

    if (
      (sale.channel !== "rrpp" && sale.channel !== "organizer") ||
      (!isSeller && !isOrganizer)
    ) {
      return NextResponse.json(
        {
          error: "No tenés acceso a esta venta.",
        },
        {
          status: 403,
        }
      );
    }

    // =====================================================
    // COMPRADOR
    // =====================================================

    const { data: buyer } = await admin
      .from("buyers")
      .select(`
        id,
        first_name,
        last_name,
        dni,
        phone
      `)
      .eq("id", sale.buyer_id)
      .maybeSingle();

    // =====================================================
    // EVENTO
    // =====================================================

    const { data: event } = await admin
      .from("events")
      .select(`
        id,
        name,
        starts_at,
        venue_name,
        city
      `)
      .eq("id", sale.event_id)
      .maybeSingle();

    // =====================================================
    // TICKETS
    // =====================================================

    const {
      data: tickets,
      error: ticketsError,
    } = await admin
      .from("tickets")
      .select(`
        id,
        display_number,
        ticket_type_id,
        manual_code,
        status
      `)
      .eq("sale_id", sale.id)
      .order("display_number", {
        ascending: true,
      });

    if (ticketsError) {
      console.error(
        "ERROR TICKETS VENTAS RRPP:",
        ticketsError
      );

      return NextResponse.json(
        {
          error: "No se pudieron cargar las entradas.",
        },
        {
          status: 500,
        }
      );
    }

    const typeIds = [
      ...new Set(
        (tickets ?? [])
          .map((ticket) => ticket.ticket_type_id)
          .filter(Boolean)
      ),
    ];

    let ticketTypes: {
      id: string;
      name: string;
    }[] = [];

    if (typeIds.length > 0) {
      const { data: types } = await admin
        .from("ticket_types")
        .select(`
          id,
          name
        `)
        .in("id", typeIds);

      ticketTypes =
        (types ?? []) as typeof ticketTypes;
    }

    const typeMap = new Map(
      ticketTypes.map((type) => [
        type.id,
        type.name,
      ])
    );

    const entries = (tickets ?? []).map((ticket) => ({
      id: ticket.id,

      displayNumber: Number(
        ticket.display_number
      ),

      manualCode: ticket.manual_code,

      status: ticket.status,

      ticketType:
        typeMap.get(ticket.ticket_type_id) ??
        "Entrada",

      url: createTicketPublicPath(ticket.id),
    }));

    return NextResponse.json({
      success: true,

      saleId: sale.id,

      event: {
        id: event?.id ?? sale.event_id,
        name: event?.name ?? "Evento",
      },

      buyer: {
        firstName: buyer?.first_name ?? "",
        lastName: buyer?.last_name ?? "",
        dni: buyer?.dni ?? null,
        phone: buyer?.phone ?? null,
      },

      entries,
    });
  } catch (error) {
    console.error(
      "ERROR API ENTRADAS VENTAS RRPP:",
      error
    );

    return NextResponse.json(
      {
        error: "Ocurrió un error inesperado.",
      },
      {
        status: 500,
      }
    );
  }
}
