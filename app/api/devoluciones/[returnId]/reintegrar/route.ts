import { NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";

// ============================================================
// PATCH
// MARCAR REINTEGRO COMO PAGADO
// ============================================================

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      returnId: string;
    }>;
  }
) {
  try {
    const {
      returnId,
    } = await context.params;

    if (!returnId) {
      return NextResponse.json(
        {
          error:
            "Falta la devolución.",
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
    // DEVOLUCIÓN
    // ========================================================

    const {
      data: ticketReturn,
      error: returnError,
    } = await admin
      .from(
        "ticket_returns"
      )
      .select(`
        id,
        organization_id,
        event_id,
        sale_id,
        ticket_id,
        refund_status,
        refund_amount_minor,
        refunded_at,
        returned_at
      `)
      .eq(
        "id",
        returnId
      )
      .eq(
        "organization_id",
        membership.organization_id
      )
      .maybeSingle();

    if (
      returnError ||
      !ticketReturn
    ) {
      console.error(
        "Reintegro - devolución:",
        returnError
      );

      return NextResponse.json(
        {
          error:
            "Devolución no encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    // ========================================================
    // VALIDACIONES
    // ========================================================

    if (
      ticketReturn.refund_status ===
      "refunded"
    ) {
      return NextResponse.json(
        {
          error:
            "Este reintegro ya fue registrado.",
        },
        {
          status: 409,
        }
      );
    }

    if (
      ticketReturn.refund_status ===
      "no_refund"
    ) {
      return NextResponse.json(
        {
          error:
            "Esta devolución fue registrada sin reintegro.",
        },
        {
          status: 409,
        }
      );
    }

    if (
      ticketReturn.refund_status !==
      "pending"
    ) {
      return NextResponse.json(
        {
          error:
            "El reintegro no está pendiente.",
        },
        {
          status: 409,
        }
      );
    }

    const now =
      new Date().toISOString();

    // ========================================================
    // MARCAR COMO REINTEGRADO
    // ========================================================

    const {
      data: updatedReturn,
      error: updateError,
    } = await admin
      .from(
        "ticket_returns"
      )
      .update({
        refund_status:
          "refunded",

        refunded_at:
          now,
      })
      .eq(
        "id",
        ticketReturn.id
      )
      .eq(
        "organization_id",
        membership.organization_id
      )
      .eq(
        "refund_status",
        "pending"
      )
      .select(`
        id,
        ticket_id,
        refund_status,
        refund_amount_minor,
        returned_at,
        refunded_at
      `)
      .maybeSingle();

    if (
      updateError ||
      !updatedReturn
    ) {
      console.error(
        "Reintegro - update:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "No se pudo registrar el reintegro.",
        },
        {
          status: 500,
        }
      );
    }

    // ========================================================
    // RESPUESTA
    // ========================================================

    return NextResponse.json({
      ok: true,

      return: {
        id:
          updatedReturn.id,

        ticketId:
          updatedReturn.ticket_id,

        refundStatus:
          updatedReturn.refund_status,

        refundAmountMinor:
          Number(
            updatedReturn.refund_amount_minor ??
              0
          ),

        returnedAt:
          updatedReturn.returned_at,

        refundedAt:
          updatedReturn.refunded_at,
      },
    });
  } catch (error) {
    console.error(
      "PATCH /api/devoluciones/[returnId]/reintegrar",
      error
    );

    return NextResponse.json(
      {
        error:
          "Error interno al registrar el reintegro.",
      },
      {
        status: 500,
      }
    );
  }
}