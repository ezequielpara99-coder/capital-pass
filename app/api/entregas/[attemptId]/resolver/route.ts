import { NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";

// ============================================================
// PATCH
// MARCAR PROBLEMA DE ENTREGA COMO RESUELTO
// ============================================================

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      attemptId: string;
    }>;
  }
) {
  try {
    const { attemptId } =
      await context.params;

    if (!attemptId) {
      return NextResponse.json(
        {
          error:
            "Falta la alerta de entrega.",
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
    // ALERTA
    // ========================================================

    const {
      data: attempt,
      error: attemptError,
    } = await admin
      .from(
        "ticket_delivery_attempts"
      )
      .select(`
        id,
        organization_id,
        event_id,
        sale_id,
        ticket_id,
        status,
        resolved_at
      `)
      .eq(
        "id",
        attemptId
      )
      .eq(
        "organization_id",
        membership.organization_id
      )
      .maybeSingle();

    if (
      attemptError ||
      !attempt
    ) {
      console.error(
        "Resolver entrega - alerta:",
        attemptError
      );

      return NextResponse.json(
        {
          error:
            "No encontramos esta alerta.",
        },
        {
          status: 404,
        }
      );
    }

    // ========================================================
    // YA RESUELTA
    // ========================================================

    if (attempt.resolved_at) {
      return NextResponse.json({
        ok: true,
        alreadyResolved: true,
        resolvedAt:
          attempt.resolved_at,
      });
    }

    // ========================================================
    // VALIDAR QUE SEA UN PROBLEMA DE ENTREGA
    // ========================================================

    if (
      attempt.status !==
      "failed"
    ) {
      return NextResponse.json(
        {
          error:
            "Esta entrega no está marcada como fallida.",
        },
        {
          status: 409,
        }
      );
    }

    // ========================================================
    // RESOLVER
    // ========================================================

    const resolvedAt =
      new Date().toISOString();

    const {
      data: updated,
      error: updateError,
    } = await admin
      .from(
        "ticket_delivery_attempts"
      )
      .update({
        resolved_at:
          resolvedAt,
      })
      .eq(
        "id",
        attempt.id
      )
      .eq(
        "organization_id",
        membership.organization_id
      )
      .select(`
        id,
        ticket_id,
        status,
        resolved_at
      `)
      .single();

    if (
      updateError ||
      !updated
    ) {
      console.error(
        "Resolver entrega - update:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "No se pudo marcar la alerta como resuelta.",
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
          updated.id,

        ticketId:
          updated.ticket_id,

        status:
          updated.status,

        resolvedAt:
          updated.resolved_at,
      },
    });
  } catch (error) {
    console.error(
      "PATCH /api/entregas/[attemptId]/resolver",
      error
    );

    return NextResponse.json(
      {
        error:
          "Error interno al resolver la alerta.",
      },
      {
        status: 500,
      }
    );
  }
}