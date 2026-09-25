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
  eventName: string;
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
  const safeEventName = escapeHtml(input.eventName);
  const plural = input.tickets.length > 1;

  const subject = `Tu ${plural ? "entradas" : "entrada"} para ${input.eventName}`;

  const text = [
    `Hola ${buyerName},`,
    "",
    `Acá tenés tu ${plural ? "entradas" : "entrada"} para ${input.eventName}.`,
    "",
    ...input.tickets.map(
      (ticket) =>
        `${ticket.ticketType}${ticket.manualCode ? ` (código ${ticket.manualCode})` : ""}: ${ticket.publicUrl}`
    ),
    "",
    "El QR de cada entrada va adjunto en este mismo email.",
    "",
    "Gracias por usar Capital Pass.",
  ].join("\n");

  const ticketsHtml = input.tickets
    .map((ticket) => {
      const safeType = escapeHtml(ticket.ticketType);
      const safeCode = ticket.manualCode ? escapeHtml(ticket.manualCode) : null;
      return `
        <div style="padding:16px;border-bottom:1px solid rgba(255,255,255,.08);">
          <p style="margin:0;color:rgba(247,243,237,.38);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">${safeType}</p>
          ${safeCode ? `<p style="margin:7px 0 0;color:#fff4ee;font-size:15px;">Código: ${safeCode}</p>` : ""}
          <p style="margin:7px 0 0;"><a href="${ticket.publicUrl}" style="color:#ffc0ad;font-size:13px;">Ver entrada</a></p>
        </div>`;
    })
    .join("");

  const html = `
    <div style="margin:0;padding:0;background:#050505;color:#f7f3ed;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:34px 22px;">
        <div style="border:1px solid rgba(255,90,42,.24);background:#0a0807;padding:28px;">
          <p style="margin:0 0 18px;color:#ff7354;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;">
            Capital Pass
          </p>
          <h1 style="margin:0;color:#fff4ee;font-size:30px;line-height:1.05;text-transform:uppercase;">
            Tu ${plural ? "entradas" : "entrada"}
          </h1>
          <p style="margin:22px 0 0;color:rgba(247,243,237,.66);font-size:15px;line-height:1.65;">
            Hola ${safeBuyerName}, acá tenés ${plural ? "tus entradas" : "tu entrada"} para <strong>${safeEventName}</strong>. El QR de cada una va adjunto en este email.
          </p>

          <div style="margin-top:26px;border:1px solid rgba(255,255,255,.10);">
            ${ticketsHtml}
          </div>
        </div>
      </div>
    </div>
  `;

  const attachments = input.tickets.map((ticket, index) => ({
    filename: `entrada-${ticket.manualCode ?? index + 1}.png`,
    content: ticket.qrPngBase64,
  }));

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
        attachments,
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
