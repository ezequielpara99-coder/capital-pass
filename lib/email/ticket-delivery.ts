export type TicketForDelivery = {
  ticketId: string;
  ticketType: string;
  manualCode: string | null;
  qrPngBase64: string;
  publicUrl: string;
};

export type TicketDeliveryInput = {
  to: string;
  buyerName: string;
  buyerDni?: string | null;
  eventName: string;
  eventStartsAt?: string | null;
  eventVenue?: string | null;
  tickets: TicketForDelivery[];
};

type DeliveryResult =
  | { ok: true; skipped?: false }
  | { ok: false; skipped?: boolean; error: string };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Fecha del evento en el mail, mismo criterio de zona horaria que el resto
// de los emails transaccionales (lib/email/subscription-receipt.ts).
function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));
}

// Mismo remitente/API key que el resto de los emails transaccionales
// (lib/email/subscription-receipt.ts, rental-inquiry.ts, renewal-reminder.ts).
// Igual que esos, no tira excepcion si el email no esta configurado --
// el caller ya emitio/confirmo la venta antes de intentar esto, mandar la
// entrada por mail es un agregado best-effort, nunca debe poder revertir
// ni bloquear una venta ya hecha.
export async function sendTicketDelivery(
  input: TicketDeliveryInput
): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TICKETS_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !apiKey.startsWith("re_") || !from) {
    console.warn(
      "TICKET DELIVERY - Email no configurado. Definí RESEND_API_KEY y TICKETS_FROM_EMAIL."
    );
    return {
      ok: false,
      skipped: true,
      error: "Email no configurado. Falta RESEND_API_KEY o TICKETS_FROM_EMAIL.",
    };
  }

  if (input.tickets.length === 0) {
    return { ok: false, skipped: true, error: "No hay entradas para enviar." };
  }

  const buyerName = input.buyerName || "Comprador";
  const safeBuyerName = escapeHtml(buyerName);
  const safeBuyerDni = input.buyerDni ? escapeHtml(input.buyerDni) : null;
  const safeEventName = escapeHtml(input.eventName);
  const safeEventDate = input.eventStartsAt ? escapeHtml(formatEventDate(input.eventStartsAt)) : null;
  const safeEventVenue = input.eventVenue ? escapeHtml(input.eventVenue) : null;
  const eventMeta = [safeEventDate, safeEventVenue].filter(Boolean).join(" · ");
  const plural = input.tickets.length > 1;

  const subject = `Tu ${plural ? "entradas" : "entrada"} para ${input.eventName}`;

  const text = [
    `Hola ${buyerName},`,
    "",
    `Acá tenés tu ${plural ? "entradas" : "entrada"} para ${input.eventName}.`,
    safeEventDate ? `Fecha: ${formatEventDate(input.eventStartsAt as string)}` : "",
    input.eventVenue ? `Lugar: ${input.eventVenue}` : "",
    input.buyerDni ? `Titular: ${buyerName} (DNI ${input.buyerDni})` : `Titular: ${buyerName}`,
    "",
    ...input.tickets.map(
      (ticket) =>
        `${ticket.ticketType}${ticket.manualCode ? ` (código ${ticket.manualCode})` : ""}: ${ticket.publicUrl}`
    ),
    "",
    "El QR de cada entrada está en este mismo email -- podés imprimirlo o mostrarlo desde el celular.",
    "",
    "Gracias por usar Capital Pass.",
  ]
    .filter(Boolean)
    .join("\n");

  // Pensado para imprimirse: fondo claro y texto oscuro en la tarjeta de
  // cada entrada (un fondo oscuro gasta mucha tinta y algunos clientes de
  // mail directamente ignoran el color de fondo al imprimir, dejando texto
  // claro sobre blanco = ilegible). El QR va embebido como data URI directo
  // en el <img> -- se ve en el cuerpo del mail sin depender de que el
  // destinatario abra ningún adjunto.
  const ticketsHtml = input.tickets
    .map((ticket) => {
      const safeType = escapeHtml(ticket.ticketType);
      const safeCode = ticket.manualCode ? escapeHtml(ticket.manualCode) : null;
      return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:2px solid #17120c;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:#17120c;padding:16px 22px;">
              <p style="margin:0;color:#ff9b82;font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">${safeType}</p>
              <p style="margin:6px 0 0;color:#fff4ee;font-size:19px;font-weight:900;letter-spacing:.01em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">${safeEventName}</p>
              ${eventMeta ? `<p style="margin:5px 0 0;color:rgba(247,243,237,.62);font-size:12px;font-family:Arial,Helvetica,sans-serif;">${eventMeta}</p>` : ""}
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:26px 22px;text-align:center;">
              <img src="data:image/png;base64,${ticket.qrPngBase64}" width="220" height="220" alt="Código QR de la entrada" style="display:block;margin:0 auto;width:220px;height:220px;border:1px solid #e7e1d5;border-radius:10px;" />
              ${safeCode ? `<p style="margin:16px 0 0;font-family:'Courier New',Courier,monospace;font-weight:700;font-size:21px;letter-spacing:.14em;color:#17120c;">${safeCode}</p>` : ""}
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 22px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px dashed #ddd6c7;padding-top:16px;">
                <tr>
                  <td style="color:#8a8474;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;padding-top:16px;">Titular</td>
                  <td align="right" style="color:#17120c;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;padding-top:16px;">${safeBuyerName}</td>
                </tr>
                ${
                  safeBuyerDni
                    ? `<tr>
                  <td style="color:#8a8474;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;padding-top:8px;">DNI</td>
                  <td align="right" style="color:#17120c;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;padding-top:8px;">${safeBuyerDni}</td>
                </tr>`
                    : ""
                }
              </table>
              <p style="margin:14px 0 0;text-align:center;"><a href="${ticket.publicUrl}" style="color:#c2410c;font-size:11px;font-family:Arial,Helvetica,sans-serif;">Ver esta entrada online →</a></p>
            </td>
          </tr>
        </table>`;
    })
    .join("");

  const html = `
    <div style="margin:0;padding:0;background:#f2efe8;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2efe8;">
        <tr>
          <td align="center" style="padding:28px 16px;">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
              <tr>
                <td style="background:#0a0807;padding:24px 26px;border-radius:16px 16px 0 0;">
                  <p style="margin:0;color:#ff7354;font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;">Capital Pass</p>
                  <h1 style="margin:8px 0 0;color:#fff4ee;font-size:26px;line-height:1.1;text-transform:uppercase;">
                    Tu ${plural ? "entradas" : "entrada"}
                  </h1>
                </td>
              </tr>
              <tr>
                <td style="background:#fffdf9;padding:22px 26px 6px;">
                  <p style="margin:0;color:#3a342c;font-size:14px;line-height:1.65;">
                    Hola ${safeBuyerName}, acá tenés ${plural ? "tus entradas" : "tu entrada"} para <strong>${safeEventName}</strong>. Podés imprimir este mail o mostrarlo desde el celular al ingresar.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#fffdf9;padding:20px 26px 26px;">
                  ${ticketsHtml}
                </td>
              </tr>
              <tr>
                <td style="background:#0a0807;padding:16px 26px;border-radius:0 0 16px 16px;text-align:center;">
                  <p style="margin:0;color:rgba(247,243,237,.4);font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Capital Pass · Gestión de eventos</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject,
        text,
        html,
      }),
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Error de red al contactar Resend.",
    };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "No se pudo leer el error de Resend.");
    return { ok: false, error: detail };
  }

  return { ok: true };
}
