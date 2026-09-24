import { NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";

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
//
// Toda la validación (permisos, estado de la entrada, cuánto se consumió
// ya del combo en la barra, y la anulación en sí) vive en la función
// process_ticket_return -- una sola transacción que toma el lock de la
// entrada ANTES de leer cuánto combo se consumió, para que un canje en la
// barra casi simultáneo no pueda dejar el reintegro calculado con un
// monto desactualizado (mismo patrón que ya usan redeem_combo_ticket,
// cancel_bar_sale y validate_ticket_manual).
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

    const {
      data,
      error,
    } = await supabase.rpc(
      "process_ticket_return",
      {
        p_ticket_id: ticketId,
        p_reason: reason,
        p_refund_status: refundStatus,
        p_refund_amount_minor: requestedRefundAmount,
      }
    );

    if (error) {
      return NextResponse.json(
        {
          error:
            error.message.replace(/^[A-Z0-9]{5}:\s*/, "") ||
            "No se pudo procesar la devolución.",
        },
        {
          status: 400,
        }
      );
    }

    const row = data?.[0];

    if (!row) {
      return NextResponse.json(
        {
          error:
            "No se pudo procesar la devolución.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      ok: true,

      event: {
        id:
          row.event_id,

        name:
          row.event_name,
      },

      ticket: {
        id:
          ticketId,

        displayNumber:
          row.ticket_display_number,

        status:
          row.ticket_status,

        cancelledAt:
          row.ticket_cancelled_at,
      },

      return: {
        id:
          row.return_id,

        reason:
          row.reason,

        refundStatus:
          row.refund_status,

        refundAmountMinor:
          Number(
            row.refund_amount_minor ??
              0
          ),

        returnedAt:
          row.returned_at,

        refundedAt:
          row.refunded_at,
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
