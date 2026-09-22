import { NextResponse } from "next/server";

import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { createTicketQRPayload } from "../../../../../lib/tickets/signature";
import { verifyOrganizerForOrg } from "../../../../../lib/auth/organizer";

type RouteContext = {
  params: Promise<{
    ticketId: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const {
      ticketId,
    } = await context.params;

    if (!ticketId) {
      return NextResponse.json(
        {
          error:
            "Entrada inválida.",
        },
        {
          status: 400,
        }
      );
    }

    // =========================================================
    // USUARIO
    // =========================================================

    const supabase =
      await createClient();

    const {
      data: {
        user,
      },
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

    // =========================================================
    // ENTRADA
    // =========================================================

    const {
      data: ticket,
      error: ticketError,
    } = await admin
      .from("tickets")
      .select(`
        id,
        event_id,
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
      return NextResponse.json(
        {
          error:
            "No encontramos la entrada.",
        },
        {
          status: 404,
        }
      );
    }

    // =========================================================
    // VALIDAR QUE EL EVENTO SEA DEL ORGANIZADOR
    // =========================================================

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
            "No encontramos el evento de esta entrada.",
        },
        {
          status: 404,
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

    // =========================================================
    // FIRMA DEL LINK PÚBLICO
    //
    // createTicketQRPayload genera:
    // CP1:<ticketId>:<firma>
    //
    // Reutilizamos exactamente la misma firma que valida
    // app/entrada/[ticketId]/page.tsx.
    // =========================================================

    const qrPayload =
      createTicketQRPayload(
        ticket.id
      );

    const expectedPrefix =
      `CP1:${ticket.id}:`;

    if (
      !qrPayload.startsWith(
        expectedPrefix
      )
    ) {
      return NextResponse.json(
        {
          error:
            "No se pudo generar el acceso seguro a la entrada.",
        },
        {
          status: 500,
        }
      );
    }

    const signature =
      qrPayload.slice(
        expectedPrefix.length
      );

    if (!signature) {
      return NextResponse.json(
        {
          error:
            "No se pudo generar la firma de la entrada.",
        },
        {
          status: 500,
        }
      );
    }

    const url =
      `/entrada/${ticket.id}?s=${encodeURIComponent(
        signature
      )}`;

    return NextResponse.json({
      ok: true,
      url,
      ticketStatus:
        ticket.status,
    });
  } catch (error) {
    console.error(
      "ERROR GENERANDO VISTA DE ENTRADA:",
      error
    );

    return NextResponse.json(
      {
        error:
          "No se pudo generar la vista de la entrada.",
      },
      {
        status: 500,
      }
    );
  }
}
