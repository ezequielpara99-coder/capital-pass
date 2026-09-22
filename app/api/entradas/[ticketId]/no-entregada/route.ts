import { NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { verifyOrganizerForOrg } from "../../../../../lib/auth/organizer";

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
    // EVENTO Y ORGANIZADOR
    // Resolvemos primero la organización dueña del evento y
    // recién después verificamos la membresía sobre ESA
    // organización puntual (un organizador puede administrar
    // más de una organización).
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
          event.organization_id,

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
      // Colisión del índice único (dos clics casi simultáneos): ya
      // quedó una alerta activa para esta entrada, no es un error real.
      if (
        insertError?.code ===
        "23505"
      ) {
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