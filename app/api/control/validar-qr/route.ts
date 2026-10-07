import { NextRequest, NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyTicketSignature } from "../../../../lib/tickets/signature";
import { parseQRPayload } from "../../../../lib/tickets/qr-payload";
import { verifyControllerForEvent } from "../../../../lib/control/auth";
import { checkRateLimit } from "../../../../lib/http/rate-limit";

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

    // Acotado a quien YA tiene sesion valida de controlador/organizador/admin
    // de este evento (no hay riesgo de bloquear compradores externos) -- pero
    // sin esto, ese mismo insider podia probar codigos/ticketId al azar sin
    // ningun limite buscando una colision con una entrada real sin usar.
    const withinRateLimit = await checkRateLimit(`qr-validate:${verification.userId}`, 120, 60);
    if (!withinRateLimit) {
      return NextResponse.json(
        { error: "Demasiados intentos. Esperá un momento." },
        { status: 429 }
      );
    }

    const admin = createAdminClient();

    // Escaneos rechazados ANTES de llegar a validate_ticket_manual (formato
    // invalido, firma invalida, entrada de otro evento) no quedaban en
    // entry_scans -- justo los casos que mas importa poder investigar
    // despues (intento de entrada con QR falso/ajeno). Se deja el mismo
    // rastro que ya deja el RPC para un codigo manual inexistente.
    async function logRejectedScan(method: "qr" | "qr_offline") {
      try {
        await admin.from("entry_scans").insert({
          event_id: eventId,
          ticket_id: null,
          controller_member_id: verification.ok ? verification.memberId : null,
          method,
          result: "invalid",
        });
      } catch (logError) {
        console.error("ERROR LOG ENTRY_SCANS:", logError);
      }
    }

    // =====================================================
    // 5. LEER QR CAPITAL PASS
    // =====================================================

    const parsed = parseQRPayload(qrPayload);
    const method = offline ? "qr_offline" : "qr";

    if (!parsed.ok) {
      await logRejectedScan(method);
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
      await logRejectedScan(method);
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
      await logRejectedScan(method);
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

      // P0001 = "raise exception" de validate_ticket_manual: son avisos
      // pensados para el controlador ("El evento no está habilitado para
      // control de ingreso", "Demasiados intentos...") -- antes se tapaban
      // con un generico y en la puerta nadie sabia que hacer. Cualquier
      // otro error de la base sigue siendo generico.
      const isBusinessError = validationError.code === "P0001" && Boolean(validationError.message);

      return NextResponse.json(
        {
          error: isBusinessError
            ? validationError.message
            : "No se pudo validar la entrada.",
        },
        {
          status: isBusinessError ? 409 : 500,
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
    // 8.5 LISTA NEGRA (best-effort, no bloquea mostrar el resultado)
    // =====================================================

    if (validation.buyer_dni) {
      try {
        const { data: blacklistData } = await supabase.rpc("check_blacklist", {
          p_event_id: eventId,
          p_dni: validation.buyer_dni,
        });
        const blacklistRow = blacklistData?.[0];
        if (blacklistRow?.is_blacklisted) {
          validation.blacklisted = true;
          validation.blacklist_reason = blacklistRow.reason ?? null;
        }
      } catch (blacklistError) {
        console.error("ERROR LISTA NEGRA QR:", blacklistError);
      }
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