import { NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";

// ============================================================
// GET
// DETALLE COMPLETO DE UNA VENTA PARA EL ORGANIZADOR
// ============================================================

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      saleId: string;
    }>;
  }
) {
  try {
    // ========================================================
    // SALE ID
    // ========================================================

    const { saleId } =
      await context.params;

    if (!saleId) {
      return NextResponse.json(
        {
          error:
            "Falta la venta.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // USUARIO
    // ========================================================

    const supabase =
      await createClient();

    const {
      data: { user },
    } =
      await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error:
            "No autorizado.",
        },
        {
          status: 401,
        }
      );
    }

    const admin =
      createAdminClient();

    // ========================================================
    // ORGANIZADOR
    // ========================================================

    const {
      data: membership,
    } = await admin
      .from(
        "organization_members"
      )
      .select(`
        id,
        organization_id,
        user_id,
        role,
        status
      `)
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "role",
        "organizer"
      )
      .eq(
        "status",
        "active"
      )
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json(
        {
          error:
            "No tenés permisos de organizador.",
        },
        {
          status: 403,
        }
      );
    }

    // ========================================================
    // VENTA
    // ========================================================

    const {
      data: sale,
      error: saleError,
    } = await admin
      .from("sales")
      .select(`
        id,
        organization_id,
        event_id,
        buyer_id,
        seller_member_id,
        status,
        channel,
        total_minor,
        currency,
        confirmed_at,
        created_at
      `)
      .eq(
        "id",
        saleId
      )
      .eq(
        "organization_id",
        membership.organization_id
      )
      .maybeSingle();

    if (
      saleError ||
      !sale
    ) {
      console.error(
        "Detalle venta - sale:",
        saleError
      );

      return NextResponse.json(
        {
          error:
            "Venta no encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    // ========================================================
    // EVENTO
    // ========================================================

    const {
      data: event,
      error: eventError,
    } = await admin
      .from("events")
      .select(`
        id,
        name,
        city,
        venue_name,
        starts_at
      `)
      .eq(
        "id",
        sale.event_id
      )
      .eq(
        "organization_id",
        membership.organization_id
      )
      .maybeSingle();

    if (
      eventError ||
      !event
    ) {
      console.error(
        "Detalle venta - event:",
        eventError
      );

      return NextResponse.json(
        {
          error:
            "Evento no encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    // ========================================================
    // COMPRADOR
    // ========================================================

    const {
      data: buyer,
      error: buyerError,
    } = await admin
      .from("buyers")
      .select(`
        id,
        first_name,
        last_name,
        dni,
        phone
      `)
      .eq(
        "id",
        sale.buyer_id
      )
      .maybeSingle();

    if (buyerError) {
      console.error(
        "Detalle venta - buyer:",
        buyerError
      );
    }

    // ========================================================
    // ITEMS DE VENTA
    // ========================================================

    const {
      data: saleItemRows,
      error: saleItemsError,
    } = await admin
      .from(
        "sale_items"
      )
      .select(`
        id,
        sale_id,
        ticket_type_id,
        quantity,
        unit_price_minor,
        subtotal_minor
      `)
      .eq(
        "sale_id",
        sale.id
      );

    if (saleItemsError) {
      console.error(
        "Detalle venta - sale_items:",
        saleItemsError
      );

      return NextResponse.json(
        {
          error:
            "No se pudieron cargar los detalles de la venta.",
        },
        {
          status: 500,
        }
      );
    }

    const saleItems =
      saleItemRows ?? [];

    // ========================================================
    // TICKETS
    //
    // IMPORTANTE:
    // Buscamos directamente por sale_id.
    //
    // No necesitamos volver a restringir por sale_item_id,
    // porque sale_id ya identifica perfectamente la venta.
    // ========================================================

    const {
      data: ticketRows,
      error: ticketsError,
    } = await admin
      .from("tickets")
      .select(`
        id,
        display_number,
        sale_id,
        sale_item_id,
        ticket_type_id,
        manual_code,
        status,
        issued_at,
        used_at,
        cancelled_at
      `)
      .eq(
        "sale_id",
        sale.id
      )
      .order(
        "display_number",
        {
          ascending: true,
        }
      );

    if (ticketsError) {
      console.error(
        "Detalle venta - tickets:",
        ticketsError
      );

      return NextResponse.json(
        {
          error:
            "No se pudieron cargar las entradas de esta venta.",
        },
        {
          status: 500,
        }
      );
    }

    const tickets =
      ticketRows ?? [];

    // ========================================================
    // TIPOS DE ENTRADA
    // ========================================================

    const typeIds = [
      ...new Set(
        tickets
          .map(
            (ticket) =>
              ticket.ticket_type_id
          )
          .filter(Boolean)
      ),
    ];

    let types: {
      id: string;
      name: string;
    }[] = [];

    if (
      typeIds.length > 0
    ) {
      const {
        data: typeRows,
        error: typeError,
      } = await admin
        .from(
          "ticket_types"
        )
        .select(`
          id,
          name
        `)
        .in(
          "id",
          typeIds
        );

      if (typeError) {
        console.error(
          "Detalle venta - ticket_types:",
          typeError
        );
      }

      types =
        (typeRows ??
          []) as typeof types;
    }

    const typeMap =
      new Map(
        types.map(
          (type) => [
            type.id,
            type.name,
          ]
        )
      );

    // ========================================================
    // ITEM MAP
    // ========================================================

    const saleItemMap =
      new Map(
        saleItems.map(
          (item) => [
            item.id,
            item,
          ]
        )
      );

    // ========================================================
    // DEVOLUCIONES EXISTENTES
    // ========================================================

    const ticketIds =
      tickets.map(
        (ticket) =>
          ticket.id
      );

    let returns: {
      id: string;

      ticket_id: string;

      reason:
        | string
        | null;

      refund_status:
        string;

      refund_amount_minor:
        | number
        | string;

      returned_at: string;

      refunded_at:
        | string
        | null;
    }[] = [];

    if (
      ticketIds.length >
      0
    ) {
      const {
        data: returnRows,
        error: returnsError,
      } = await admin
        .from(
          "ticket_returns"
        )
        .select(`
          id,
          ticket_id,
          reason,
          refund_status,
          refund_amount_minor,
          returned_at,
          refunded_at
        `)
        .in(
          "ticket_id",
          ticketIds
        );

      if (returnsError) {
        console.error(
          "Detalle venta - ticket_returns:",
          returnsError
        );
      }

      returns =
        (returnRows ??
          []) as typeof returns;
    }

    const returnMap =
      new Map(
        returns.map(
          (item) => [
            item.ticket_id,
            item,
          ]
        )
      );

    // ========================================================
    // VENDEDOR
    // ========================================================

    let seller:
      | {
          memberId: string;
          name: string;
        }
      | null =
      null;

    if (
      sale.seller_member_id
    ) {
      const {
        data: sellerMember,
      } = await admin
        .from(
          "organization_members"
        )
        .select(`
          id,
          user_id
        `)
        .eq(
          "id",
          sale.seller_member_id
        )
        .eq(
          "organization_id",
          membership.organization_id
        )
        .maybeSingle();

      if (sellerMember) {
        const {
          data: sellerProfile,
        } = await admin
          .from("profiles")
          .select(`
            id,
            first_name,
            last_name
          `)
          .eq(
            "id",
            sellerMember.user_id
          )
          .maybeSingle();

        seller = {
          memberId:
            sellerMember.id,

          name:
            sellerProfile
              ? `${sellerProfile.first_name ?? ""} ${sellerProfile.last_name ?? ""}`.trim() ||
                "Vendedor"
              : "Vendedor",
        };
      }
    }

    // ========================================================
    // ARMAR ENTRADAS
    // ========================================================

    const ticketDetails =
      tickets.map(
        (ticket) => {
          const saleItem =
            saleItemMap.get(
              ticket.sale_item_id
            );

          const ticketReturn =
            returnMap.get(
              ticket.id
            );

          return {
            id:
              ticket.id,

            displayNumber:
              ticket.display_number,

            manualCode:
              ticket.manual_code,

            status:
              ticket.status,

            ticketTypeId:
              ticket.ticket_type_id,

            ticketType:
              typeMap.get(
                ticket.ticket_type_id
              ) ??
              "Entrada",

            unitPriceMinor:
              Number(
                saleItem
                  ?.unit_price_minor ??
                  0
              ),

            issuedAt:
              ticket.issued_at,

            usedAt:
              ticket.used_at,

            cancelledAt:
              ticket.cancelled_at,

            canReturn:
              ticket.status ===
              "issued",

            return:
              ticketReturn
                ? {
                    id:
                      ticketReturn.id,

                    reason:
                      ticketReturn.reason,

                    refundStatus:
                      ticketReturn.refund_status,

                    refundAmountMinor:
                      Number(
                        ticketReturn.refund_amount_minor ??
                          0
                      ),

                    returnedAt:
                      ticketReturn.returned_at,

                    refundedAt:
                      ticketReturn.refunded_at,
                  }
                : null,
          };
        }
      );

    // ========================================================
    // MÉTRICAS
    // ========================================================

    const activeTickets =
      ticketDetails.filter(
        (ticket) =>
          ticket.status ===
          "issued"
      ).length;

    const usedTickets =
      ticketDetails.filter(
        (ticket) =>
          ticket.status ===
          "used"
      ).length;

    const returnedTickets =
      ticketDetails.filter(
        (ticket) =>
          ticket.status ===
          "cancelled"
      ).length;

    // ========================================================
    // RESPUESTA
    // ========================================================

    return NextResponse.json({
      ok: true,

      sale: {
        id:
          sale.id,

        status:
          sale.status,

        channel:
          sale.channel,

        totalMinor:
          Number(
            sale.total_minor ??
              0
          ),

        currency:
          sale.currency,

        confirmedAt:
          sale.confirmed_at,

        createdAt:
          sale.created_at,
      },

      event: {
        id:
          event.id,

        name:
          event.name,

        city:
          event.city,

        venueName:
          event.venue_name,

        startsAt:
          event.starts_at,
      },

      buyer: {
        id:
          buyer?.id ??
          null,

        firstName:
          buyer?.first_name ??
          "",

        lastName:
          buyer?.last_name ??
          "",

        dni:
          buyer?.dni ??
          null,

        phone:
          buyer?.phone ??
          null,
      },

      seller,

      tickets:
        ticketDetails,

      metrics: {
        totalTickets:
          ticketDetails.length,

        activeTickets,

        usedTickets,

        returnedTickets,
      },
    });
  } catch (error) {
    console.error(
      "GET /api/ventas/[saleId]/detalle",
      error
    );

    return NextResponse.json(
      {
        error:
          "No se pudo cargar el detalle de la venta.",
      },
      {
        status: 500,
      }
    );
  }
}