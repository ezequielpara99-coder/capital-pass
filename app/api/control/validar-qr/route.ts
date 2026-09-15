import { NextRequest, NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyTicketSignature } from "../../../../lib/tickets/signature";

type QRRequestBody = {
  eventId?: string;
  qrPayload?: string;
};

type QRPayloadResult =
  | {
      ok: true;
      ticketId: string;
      signature: string;
    }
  | {
      ok: false;
    };

function parseQRPayload(value: string): QRPayloadResult {
  const trimmed = value.trim();

  const parts = trimmed.split(":");

  if (parts.length !== 3) {
    return { ok: false };
  }

  const [version, ticketId, signature] = parts;

  if (version !== "CP1") {
    return { ok: false };
  }

  if (!ticketId || !signature) {
    return { ok: false };
  }

  return {
    ok: true,
    ticketId,
    signature,
  };
}

export async function POST(request: NextRequest) {
  try {
    // =====================================================
    // 1. LEER BODY
    // =====================================================

    const body = (await request.json()) as QRRequestBody;

    const eventId = body.eventId?.trim();
    const qrPayload = body.qrPayload?.trim();

    if (!eventId || !qrPayload) {
      return NextResponse.json(
        {
          error: "Faltan datos para validar la entrada.",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // 2. VERIFICAR USUARIO
    // =====================================================

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error: "No hay una sesión válida.",
        },
        {
          status: 401,
        }
      );
    }

    // =====================================================
    // 3. VERIFICAR QUE SEA CONTROLADOR ACTIVO
    // =====================================================

    const {
      data: memberships,
      error: membershipError,
    } = await supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "controller")
      .eq("status", "active");

    if (membershipError) {
      console.error(
        "ERROR MEMBERSHIP QR:",
        membershipError
      );

      return NextResponse.json(
        {
          error: "No se pudo verificar el acceso del controlador.",
        },
        {
          status: 500,
        }
      );
    }

    const memberIds =
      memberships?.map((item) => item.id) ?? [];

    if (memberIds.length === 0) {
      return NextResponse.json(
        {
          error: "Tu cuenta no tiene permisos de control.",
        },
        {
          status: 403,
        }
      );
    }

    // =====================================================
    // 4. VERIFICAR ASIGNACIÓN AL EVENTO
    // =====================================================

    const {
      data: assignment,
      error: assignmentError,
    } = await supabase
      .from("event_staff")
      .select("id")
      .eq("event_id", eventId)
      .in("organization_member_id", memberIds)
      .eq("staff_role", "controller")
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (assignmentError) {
      console.error(
        "ERROR ASSIGNMENT QR:",
        assignmentError
      );

      return NextResponse.json(
        {
          error: "No se pudo verificar la asignación al evento.",
        },
        {
          status: 500,
        }
      );
    }

    if (!assignment) {
      return NextResponse.json(
        {
          error: "No estás autorizado para controlar este evento.",
        },
        {
          status: 403,
        }
      );
    }

    // =====================================================
    // 5. LEER QR CAPITAL PASS
    // =====================================================

    const parsed = parseQRPayload(qrPayload);

    if (!parsed.ok) {
      return NextResponse.json(
        {
          result: "invalid",
          message: "El QR no pertenece a Capital Pass.",
        },
        {
          status: 200,
        }
      );
    }

    // =====================================================
    // 6. VERIFICAR FIRMA CRIPTOGRÁFICA
    // =====================================================

    const signatureIsValid = verifyTicketSignature(
      parsed.ticketId,
      parsed.signature
    );

    if (!signatureIsValid) {
      return NextResponse.json(
        {
          result: "invalid",
          message: "La firma de la entrada no es válida.",
        },
        {
          status: 200,
        }
      );
    }

    // =====================================================
    // 7. BUSCAR EL TICKET REAL
    // =====================================================

    const admin = createAdminClient();

    const {
      data: ticket,
      error: ticketError,
    } = await admin
      .from("tickets")
      .select(`
        id,
        event_id,
        manual_code
      `)
      .eq("id", parsed.ticketId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (ticketError) {
      console.error(
        "ERROR TICKET QR:",
        ticketError
      );

      return NextResponse.json(
        {
          error: "No se pudo consultar la entrada.",
        },
        {
          status: 500,
        }
      );
    }

    if (!ticket) {
      return NextResponse.json(
        {
          result: "invalid",
          message: "La entrada no pertenece a este evento.",
        },
        {
          status: 200,
        }
      );
    }

    // =====================================================
    // 8. USAR LA MISMA VALIDACIÓN QUE EL CÓDIGO MANUAL
    // =====================================================

    const {
      data: validationData,
      error: validationError,
    } = await supabase.rpc(
      "validate_ticket_manual",
      {
        p_event_id: eventId,
        p_manual_code: ticket.manual_code,
      }
    );

    if (validationError) {
      console.error(
        "ERROR VALIDATE QR:",
        validationError
      );

      return NextResponse.json(
        {
          error: "No se pudo validar la entrada.",
        },
        {
          status: 500,
        }
      );
    }

    const validation = validationData?.[0];

    if (!validation) {
      return NextResponse.json(
        {
          error: "La validación no devolvió ningún resultado.",
        },
        {
          status: 500,
        }
      );
    }

    // =====================================================
    // 9. RESPUESTA
    // =====================================================

    return NextResponse.json(validation);
  } catch (error) {
    console.error(
      "ERROR API VALIDAR QR:",
      error
    );

    return NextResponse.json(
      {
        error: "Ocurrió un error inesperado al validar el QR.",
      },
      {
        status: 500,
      }
    );
  }
}