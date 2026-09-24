import { NextRequest, NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyTicketSignature } from "../../../../lib/tickets/signature";
import { parseQRPayload } from "../../../../lib/tickets/qr-payload";
import { verifyControllerForEvent } from "../../../../lib/control/auth";

type QRRequestBody = {
  eventId?: string;
  qrPayload?: string;
  // true cuando esta llamada es la sincronizacion de un escaneo que se
  // valido offline contra el cache local (modo offline de control) --
  // sirve solo para etiquetar method='qr_offline' en entry_scans, la
  // verificacion de firma/permisos es identica en ambos casos.
  offline?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    // =====================================================
    // 1. LEER BODY
    // =====================================================

    const body = (await request.json()) as QRRequestBody;

    const eventId = body.eventId?.trim();
    const qrPayload = body.qrPayload?.trim();
    const offline = body.offline === true;

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
    // 2-4. VERIFICAR USUARIO + CONTROLADOR ASIGNADO AL EVENTO
    // =====================================================

    const supabase = await createClient();

    const verification = await verifyControllerForEvent(eventId);
    if (!verification.ok) {
      return NextResponse.json(
        { error: verification.error },
        { status: verification.status }
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
        p_method: offline ? "qr_offline" : "qr",
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