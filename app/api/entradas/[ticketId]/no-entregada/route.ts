import { NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";

// ============================================================
// POST
// MARCAR UNA ENTRADA COMO NO ENTREGADA
// ============================================================

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      ticketId: string;
    }>;
  }
) {
  try {
    const { ticketId } =
      await context.params;

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

    // ========================================================
    // BODY
    // ========================================================

    const body =
      await request
        .json()
        .catch(() => ({}));

    const reason =
      typeof body?.reason === "string"
        ? body.reason.trim()
        : "";

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
      .from("organization_members")
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
    // TICKET
    // ========================================================

    const {
      data: ticket,
      error: ticketError,
    } = await admin
      .from("tickets")
      .select(`
        id,
        event_id,
        sale_id,
        status
      `)
      .eq(
        "id",
        ticketId
      )
      .maybeSingle();

    if (
      ticketError ||
      !ticket
    ) {
      console.error(
        "No entregada - ticket:",
        ticketError
      );

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
    // EVENTO
    // ========================================================

    const {
      data: event,
      error: eventError,
    } = await admin
      .from("events")
      .select(`
        id,
        organization_id
      `)
      .eq(
        "id",
        ticket.event_id
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
      return NextResponse.json(
        {
          error:
            "La entrada no pertenece a tu organización.",
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
        buyer_id
      `)
      .eq(
        "id",
        ticket.sale_id
      )
      .maybeSingle();

    if (
      saleError ||
      !sale
    ) {
      return NextResponse.json(
        {
          error:
            "No encontramos la venta de esta entrada.",
        },
        {
          status: 404,
        }
      );
    }

    // ========================================================
    // COMPRADOR / TELÉFONO
    // ========================================================

    const {
      data: buyer,
    } = await admin
      .from("buyers")
      .select(`
        id,
        phone
      `)
      .eq(
        "id",
        sale.buyer_id
      )
      .maybeSingle();

    // ========================================================
    // EVITAR DUPLICADO
    // ========================================================

    const {
      data: existing,
    } = await admin
      .from(
        "ticket_delivery_attempts"
      )
      .select(`
        id,
        status
      `)
      .eq(
        "ticket_id",
        ticket.id
      )
      .eq(
        "status",
        "failed"
      )
      .is(
        "resolved_at",
        null
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          error:
            "Esta entrada ya está marcada como no entregada.",
        },
        {
          status: 409,
        }
      );
    }

    // ========================================================
    // CREAR ALERTA
    // ========================================================

    const now =
      new Date().toISOString();

    const {
      data: deliveryAttempt,
      error: insertError,
    } = await admin
      .from(
        "ticket_delivery_attempts"
      )
      .insert({
        organization_id:
          membership.organization_id,

        event_id:
          ticket.event_id,

        sale_id:
          ticket.sale_id,

        ticket_id:
          ticket.id,

        channel:
          "whatsapp_link",

        status:
          "failed",

        recipient_phone:
          buyer?.phone ??
          null,

        failure_reason:
          reason ||
          "El organizador indicó que la entrada no llegó al comprador.",

        provider:
          "manual",

        created_by_profile_id:
          user.id,

        failed_at:
          now,
      })
      .select(`
        id,
        ticket_id,
        status,
        recipient_phone,
        failure_reason,
        failed_at,
        created_at
      `)
      .single();

    if (
      insertError ||
      !deliveryAttempt
    ) {
      console.error(
        "No entregada - insert:",
        insertError
      );

      return NextResponse.json(
        {
          error:
            "No se pudo marcar la entrada como no entregada.",
        },
        {
          status: 500,
        }
      );
    }

    // ========================================================
    // OK
    // ========================================================

    return NextResponse.json({
      ok: true,

      deliveryAttempt: {
        id:
          deliveryAttempt.id,

        ticketId:
          deliveryAttempt.ticket_id,

        status:
          deliveryAttempt.status,

        phone:
          deliveryAttempt.recipient_phone,

        reason:
          deliveryAttempt.failure_reason,

        failedAt:
          deliveryAttempt.failed_at,
      },
    });
  } catch (error) {
    console.error(
      "POST /api/entradas/[ticketId]/no-entregada",
      error
    );

    return NextResponse.json(
      {
        error:
          "Error interno al registrar la entrega.",
      },
      {
        status: 500,
      }
    );
  }
}