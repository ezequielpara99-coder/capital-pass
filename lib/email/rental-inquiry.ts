export type RentalInquiryInput = {
  businessName: string;
  contactName: string;
  phone: string;
  email: string | null;
  city: string | null;
  terminalQuantity: string | null;
  message: string | null;
};

type SendResult = { ok: true } | { ok: false; skipped?: boolean; error: string };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendRentalInquiryNotification(input: RentalInquiryInput): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RECEIPTS_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL;
  const to = process.env.RENTALS_NOTIFY_EMAIL ?? process.env.SUPPORT_EMAIL;

  if (!apiKey || !apiKey.startsWith("re_") || !from || !to) {
    console.warn("RENTAL INQUIRY - Email no configurado. Definí RESEND_API_KEY, RECEIPTS_FROM_EMAIL y RENTALS_NOTIFY_EMAIL.");
    return { ok: false, skipped: true, error: "Email no configurado." };
  }

  const subject = `Capital Rentals — nueva consulta de ${input.businessName}`;
  const text = [
    "Nueva consulta de alquiler de terminales (Capital Rentals):",
    "",
    `Negocio: ${input.businessName}`,
    `Contacto: ${input.contactName}`,
    `Teléfono: ${input.phone}`,
    input.email ? `Email: ${input.email}` : null,
    input.city ? `Ciudad: ${input.city}` : null,
    input.terminalQuantity ? `Cantidad de terminales: ${input.terminalQuantity}` : null,
    input.message ? `Mensaje: ${input.message}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#050505;color:#f7f3ed;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:34px 22px;">
        <div style="border:1px solid rgba(255,90,42,.24);background:#0a0807;padding:28px;">
          <p style="margin:0 0 18px;color:#ff7354;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;">Capital Rentals</p>
          <h1 style="margin:0;color:#fff4ee;font-size:28px;line-height:1.05;text-transform:uppercase;">Nueva consulta de alquiler</h1>
          <div style="margin-top:22px;border:1px solid rgba(255,255,255,.10);">
            ${[
              ["Negocio", input.businessName],
              ["Contacto", input.contactName],
              ["Teléfono", input.phone],
              ["Email", input.email ?? "—"],
              ["Ciudad", input.city ?? "—"],
              ["Cantidad de terminales", input.terminalQuantity ?? "—"],
            ]
              .map(
                ([label, value]) => `
              <div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08);">
                <p style="margin:0;color:rgba(247,243,237,.38);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">${escapeHtml(label)}</p>
                <p style="margin:6px 0 0;color:#fff4ee;font-size:15px;font-weight:700;">${escapeHtml(value)}</p>
              </div>`
              )
              .join("")}
            ${
              input.message
                ? `<div style="padding:14px 16px;"><p style="margin:0;color:rgba(247,243,237,.38);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">Mensaje</p><p style="margin:6px 0 0;color:#fff4ee;font-size:14px;line-height:1.5;">${escapeHtml(input.message)}</p></div>`
                : ""
            }
          </div>
        </div>
      </div>
    </div>
  `;

  // Un error de red real (no solo un !response.ok) lanzaria una excepcion
  // sin capturar -- el caller (POST /api/rentals/inquiries) ya guardo la
  // consulta en la base antes de llegar aca, asi que dejar que esto tire
  // haria que el visitante vea un error 500 pese a que su consulta si
  // quedo registrada.
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text, html }),
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Error de red al contactar Resend." };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "No se pudo leer el error de Resend.");
    return { ok: false, error: detail };
  }
  return { ok: true };
}
