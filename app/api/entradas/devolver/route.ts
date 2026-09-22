import { NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyOrganizerForOrg } from "../../../../lib/auth/organizer";

// ============================================================
// HELPERS
// ============================================================

function cleanText(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned.length > 0
    ? cleaned
    : null;
}

function getRefundStatus(
  value: unknown
):
  | "pending"
  | "refunded"
  | "no_refund"
  | null {
  if (
    value === "pending" ||
    value === "refunded" ||
    value === "no_refund"
  ) {
    return value;
  }

  return null;
}

function getAmount(
  value: unknown
): number | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const amount =
    Number(value);

  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    return null;
  }

  return Math.round(
    amount
  );
}

// ============================================================
// POST
//
// {
//   ticketId: "...",
//   reason: "Compró por error",
//   refundStatus: "pending" | "refunded" | "no_refund",
//   refundAmountMinor?: 12000
// }
// ============================================================

export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    const ticketId =
      cleanText(
        body.ticketId
      );

    const reason =
      cleanText(
        body.reason
      );

    const refundStatus =
      getRefundStatus(
        body.refundStatus
      );

    const requestedRefundAmount =
      getAmount(
        body.refundAmountMinor
      );

    // ========================================================
    // VALIDACIONES BÁSICAS
    // ========================================================

    if (!ticketId) {
      return NextResponse.json(
        {
          error:
            "Falta la entrada.",
        },
        {
          status: 400,
        }
      );
    }

    if (!reason) {
      return NextResponse.json(
        {
          error:
            "Indicá el motivo de la devolución.",
        },
        {
          status: 400,
        }
      );
    }

    if (!refundStatus) {
      return NextResponse.json(
        {
          error:
            "Indicá el estado del reintegro.",
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
    // ENTRADA
    // ========================================================

    const {
      data: ticket,
    } = await admin
      .from("tickets")
      .select(`
        id,
        display_number,
        sale_id,
        sale_item_id,
        event_id,
        ticket_type_id,
        status,
        issued_at,
        used_at,
        cancelled_at
      `)
      .eq(
        "id",
        ticketId
      )
      .maybeSingle();

    if (!ticket) {
      return NextResponse.json(
        {
          error:
            "Entrada no encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    // ========================================================
    // EVENTO Y ORGANIZADOR
    // Resolvemos primero la organización dueña del evento y
    // recién después verificamos la membresía sobre ESA
    // organización puntual (un organizador puede administrar
    // más de una organización).
    // ========================================================

    const {
      data: event,
    } = await admin
      .from("events")
      .select(`
        id,
        organization_id,
        name
      `)
      .eq(
        "id",
        ticket.event_id
      )
      .maybeSingle();

    if (!event) {
      return NextResponse.json(
        {
          error:
            "Esta entrada no pertenece a tu organización.",
        },
        {
          status: 403,
        }
      );
    }

    const verification =
      await verifyOrganizerForOrg(
        event.organization_id
      );

    if (!verification.ok) {
      return NextResponse.json(
        {
          error:
            verification.error,
        },
        {
          status:
            verification.status,
        }
      );
    }

    // ========================================================
    // ESTADO DE LA ENTRADA
    // ========================================================

    if (
      ticket.status ===
      "used"
    ) {
      return NextResponse.json(
        {
          error:
            "No se puede devolver una entrada que ya fue utilizada.",
        },
        {
          status: 409,
        }
      );
    }

    if (
      ticket.status ===
      "cancelled"
    ) {
      return NextResponse.json(
        {
          error:
            "Esta entrada ya está anulada o devuelta.",
        },
        {
          status: 409,
        }
      );
    }

    if (
      ticket.status !==
      "issued"
    ) {
      return NextResponse.json(
        {
          error:
            `No se puede devolver una entrada con estado "${ticket.status}".`,
        },
        {
          status: 409,
        }
      );
    }

    // ========================================================
    // VERIFICAR QUE NO EXISTA DEVOLUCIÓN
    // ========================================================

    const {
      data: existingReturn,
    } = await admin
      .from(
        "ticket_returns"
      )
      .select(`
        id,
        returned_at
      `)
      .eq(
        "ticket_id",
        ticket.id
      )
      .maybeSingle();

    if (existingReturn) {
      return NextResponse.json(
        {
          error:
            "Esta entrada ya tiene una devolución registrada.",
        },
        {
          status: 409,
        }
      );
    }

    // ========================================================
    // PRECIO ORIGINAL DE ESA ENTRADA
    //
    // Usamos sale_items porque ahí quedó congelado
    // el precio al momento de la venta.
    // ========================================================

    const {
      data: saleItem,
    } = await admin
      .from(
        "sale_items"
      )
      .select(`
        id,
        unit_price_minor
      `)
      .eq(
        "id",
        ticket.sale_item_id
      )
      .maybeSingle();

    if (!saleItem) {
      return NextResponse.json(
        {
          error:
            "No se pudo determinar el precio original de la entrada.",
        },
        {
          status: 500,
        }
      );
    }

    const originalPrice =
      Number(
        saleItem.unit_price_minor ??
          0
      );

    // ========================================================
    // IMPORTE DEL REINTEGRO
    // ========================================================

    let refundAmountMinor =
      0;

    if (
      refundStatus ===
      "pending" ||
      refundStatus ===
      "refunded"
    ) {
      refundAmountMinor =
        requestedRefundAmount ??
        originalPrice;
    }

    if (
      refundStatus ===
      "no_refund"
    ) {
      refundAmountMinor =
        0;
    }

    if (
      refundAmountMinor >
      originalPrice
    ) {
      return NextResponse.json(
        {
          error:
            "El reintegro no puede superar el precio original de la entrada.",
        },
        {
          status: 400,
        }
      );
    }

    const now =
      new Date().toISOString();

    // ========================================================
    // 1. RESERVAMOS LA DEVOLUCIÓN
    //
    // ticket_id es UNIQUE.
    // Esto evita que dos personas intenten devolver
    // la misma entrada al mismo tiempo.
    // ========================================================

    const {
      data: returnRow,
      error: returnError,
    } = await admin
      .from(
        "ticket_returns"
      )
      .insert({
        organization_id:
          event.organization_id,

        event_id:
          ticket.event_id,

        sale_id:
          ticket.sale_id,

        ticket_id:
          ticket.id,

        reason,

        refund_status:
          refundStatus,

        refund_amount_minor:
          refundAmountMinor,

        returned_by_profile_id:
          user.id,

        returned_at:
          now,

        refunded_at:
          refundStatus ===
          "refunded"
            ? now
            : null,
      })
      .select(`
        id,
        ticket_id,
        reason,
        refund_status,
        refund_amount_minor,
        returned_at,
        refunded_at
      `)
      .single();

    if (
      returnError ||
      !returnRow
    ) {
      /*
       * Si fue una colisión del índice UNIQUE,
       * probablemente ya se devolvió.
       */
      if (
        returnError?.code ===
        "23505"
      ) {
        return NextResponse.json(
          {
            error:
              "Esta entrada ya fue devuelta.",
          },
          {
            status: 409,
          }
        );
      }

      console.error(
        "Error creando ticket_return:",
        returnError
      );

      return NextResponse.json(
        {
          error:
            "No se pudo registrar la devolución.",
        },
        {
          status: 500,
        }
      );
    }

    // ========================================================
    // 2. ANULAR ENTRADA
    //
    // Solamente se actualiza si TODAVÍA está issued.
    //
    // Esto protege el caso extremo donde un controlador
    // intenta usarla al mismo tiempo que se devuelve.
    // ========================================================

    const {
      data: cancelledTicket,
      error: cancelError,
    } = await admin
      .from("tickets")
      .update({
        status:
          "cancelled",

        cancelled_at:
          now,

        updated_at:
          now,
      })
      .eq(
        "id",
        ticket.id
      )
      .eq(
        "status",
        "issued"
      )
      .select(`
        id,
        display_number,
        sale_id,
        event_id,
        ticket_type_id,
        status,
        cancelled_at
      `)
      .maybeSingle();

    // ========================================================
    // SI NO PUDIMOS ANULARLA,
    // ELIMINAMOS LA DEVOLUCIÓN RECIÉN CREADA.
    // ========================================================

    if (
      cancelError ||
      !cancelledTicket
    ) {
      await admin
        .from(
          "ticket_returns"
        )
        .delete()
        .eq(
          "id",
          returnRow.id
        );

      // Volvemos a leer el estado actual
      // para dar un mensaje correcto.

      const {
        data: currentTicket,
      } = await admin
        .from("tickets")
        .select(`
          status,
          used_at
        `)
        .eq(
          "id",
          ticket.id
        )
        .maybeSingle();

      if (
        currentTicket?.status ===
        "used"
      ) {
        return NextResponse.json(
          {
            error:
              "La entrada fue utilizada antes de completar la devolución.",
          },
          {
            status: 409,
          }
        );
      }

      return NextResponse.json(
        {
          error:
            "No se pudo anular la entrada.",
        },
        {
          status: 409,
        }
      );
    }

    // ========================================================
    // RESPUESTA
    // ========================================================

    return NextResponse.json({
      ok: true,

      event: {
        id:
          event.id,

        name:
          event.name,
      },

      ticket: {
        id:
          cancelledTicket.id,

        displayNumber:
          cancelledTicket.display_number,

        status:
          cancelledTicket.status,

        cancelledAt:
          cancelledTicket.cancelled_at,
      },

      return: {
        id:
          returnRow.id,

        reason:
          returnRow.reason,

        refundStatus:
          returnRow.refund_status,

        refundAmountMinor:
          Number(
            returnRow.refund_amount_minor ??
              0
          ),

        returnedAt:
          returnRow.returned_at,

        refundedAt:
          returnRow.refunded_at,
      },
    });
  } catch (error) {
    console.error(
      "POST /api/entradas/devolver",
      error
    );

    return NextResponse.json(
      {
        error:
          "Error interno al devolver la entrada.",
      },
      {
        status: 500,
      }
    );
  }
}