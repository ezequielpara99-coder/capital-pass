export type RenewalReminderInput = {
  to: string;
  customerName: string;
  organizationName: string;
  planName: string;
  periodEnd: string;
  renewUrl: string;
};

type ReminderResult =
  | { ok: true }
  | { ok: false; skipped?: boolean; error: string };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export async function sendRenewalReminder(
  input: RenewalReminderInput
): Promise<ReminderResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RECEIPTS_FROM_EMAIL ??
    process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !apiKey.startsWith("re_") || !from) {
    console.warn(
      "RENEWAL REMINDER - Email no configurado. Definí RESEND_API_KEY y RECEIPTS_FROM_EMAIL."
    );

    return {
      ok: false,
      skipped: true,
      error:
        "Email no configurado. Falta RESEND_API_KEY o RECEIPTS_FROM_EMAIL.",
    };
  }

  const customerName = input.customerName || "Organizador";
  const periodEnd = formatDate(input.periodEnd);

  const safeCustomerName = escapeHtml(customerName);
  const safeOrganizationName = escapeHtml(input.organizationName);
  const safePlanName = escapeHtml(input.planName);
  const safePeriodEnd = escapeHtml(periodEnd);
  const safeRenewUrl = escapeHtml(input.renewUrl);

  const subject = "Tu suscripción a Capital Pass vence pronto";

  const text = [
    `Hola ${customerName},`,
    "",
    `Tu suscripción a Capital Pass (${input.planName}) vence el ${periodEnd}.`,
    "",
    `Organización: ${input.organizationName}`,
    "",
    "Renová acá para que tu cuenta no se bloquee:",
    input.renewUrl,
    "",
    "Gracias por usar Capital Pass.",
  ].join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#050505;color:#f7f3ed;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:34px 22px;">
        <div style="border:1px solid rgba(255,90,42,.24);background:#0a0807;padding:28px;">
          <p style="margin:0 0 18px;color:#ff7354;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;">
            Capital Pass
          </p>
          <h1 style="margin:0;color:#fff4ee;font-size:32px;line-height:1;text-transform:uppercase;">
            Tu suscripción vence pronto
          </h1>
          <p style="margin:22px 0 0;color:rgba(247,243,237,.66);font-size:15px;line-height:1.65;">
            Hola ${safeCustomerName}, tu suscripción a Capital Pass vence el <strong style="color:#fff4ee;">${safePeriodEnd}</strong>. Renovala antes de esa fecha para que tu cuenta y la de tu equipo no se bloqueen.
          </p>

          <div style="margin-top:26px;border:1px solid rgba(255,255,255,.10);">
            <div style="padding:16px;border-bottom:1px solid rgba(255,255,255,.08);">
              <p style="margin:0;color:rgba(247,243,237,.38);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">Organización</p>
              <p style="margin:7px 0 0;color:#fff4ee;font-size:16px;font-weight:800;">${safeOrganizationName}</p>
            </div>
            <div style="padding:16px;">
              <p style="margin:0;color:rgba(247,243,237,.38);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">Plan</p>
              <p style="margin:7px 0 0;color:#fff4ee;font-size:16px;font-weight:800;">${safePlanName}</p>
            </div>
          </div>

          <a href="${safeRenewUrl}" style="display:inline-block;margin-top:26px;background:#ff3b24;color:#fff;text-decoration:none;font-weight:900;font-size:12px;letter-spacing:.14em;text-transform:uppercase;padding:16px 26px;">
            Renovar suscripción
          </a>
        </div>
      </div>
    </div>
  `;

  const response = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: input.to, subject, text, html }),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "No se pudo leer el error de Resend.");
    return { ok: false, error: detail };
  }

  return { ok: true };
}
