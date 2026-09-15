export type ReceiptInput = {
  to: string;
  customerName: string;
  organizationName: string;
  planName: string;
  amount: number;
  currency: string;
  paidAt: string;
  periodEnd: string;
  mercadoPagoPreapprovalId: string;
  paymentId?: string;
};

type ReceiptResult =
  | {
      ok: true;
      skipped?: false;
    }
  | {
      ok: false;
      skipped?: boolean;
      error: string;
    };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export async function sendSubscriptionReceipt(
  input: ReceiptInput
): Promise<ReceiptResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RECEIPTS_FROM_EMAIL ??
    process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !apiKey.startsWith("re_") || !from) {
    console.warn(
      "SUBSCRIPTION RECEIPT - Email no configurado. Definí RESEND_API_KEY y RECEIPTS_FROM_EMAIL."
    );

    return {
      ok: false,
      skipped: true,
      error:
        "Email no configurado. Falta RESEND_API_KEY o RECEIPTS_FROM_EMAIL.",
    };
  }

  const customerName =
    input.customerName || "Organizador";

  const amount = formatMoney(
    input.amount,
    input.currency
  );

  const paidAt = formatDate(
    input.paidAt
  );

  const periodEnd = formatDate(
    input.periodEnd
  );

  const safeCustomerName =
    escapeHtml(customerName);
  const safeOrganizationName =
    escapeHtml(input.organizationName);
  const safePlanName =
    escapeHtml(input.planName);
  const safeAmount =
    escapeHtml(amount);
  const safePaidAt =
    escapeHtml(paidAt);
  const safePeriodEnd =
    escapeHtml(periodEnd);
  const safePreapprovalId =
    escapeHtml(input.mercadoPagoPreapprovalId);

  const subject =
    "Recibo de suscripción Capital Pass";

  const text = [
    `Hola ${customerName},`,
    "",
    "Recibimos el pago de tu suscripción a Capital Pass.",
    "",
    `Organización: ${input.organizationName}`,
    `Plan: ${input.planName}`,
    `Importe: ${amount}`,
    `Fecha de pago: ${paidAt}`,
    `Período cubierto hasta: ${periodEnd}`,
    `Referencia Mercado Pago: ${input.mercadoPagoPreapprovalId}`,
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
          <h1 style="margin:0;color:#fff4ee;font-size:34px;line-height:.95;text-transform:uppercase;">
            Recibo de suscripción
          </h1>
          <p style="margin:22px 0 0;color:rgba(247,243,237,.66);font-size:15px;line-height:1.65;">
            Hola ${safeCustomerName}, recibimos el pago de tu suscripción.
          </p>

          <div style="margin-top:26px;border:1px solid rgba(255,255,255,.10);">
            <div style="padding:16px;border-bottom:1px solid rgba(255,255,255,.08);">
              <p style="margin:0;color:rgba(247,243,237,.38);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">Organización</p>
              <p style="margin:7px 0 0;color:#fff4ee;font-size:16px;font-weight:800;">${safeOrganizationName}</p>
            </div>
            <div style="padding:16px;border-bottom:1px solid rgba(255,255,255,.08);">
              <p style="margin:0;color:rgba(247,243,237,.38);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">Plan</p>
              <p style="margin:7px 0 0;color:#fff4ee;font-size:16px;font-weight:800;">${safePlanName}</p>
            </div>
            <div style="padding:16px;border-bottom:1px solid rgba(255,255,255,.08);">
              <p style="margin:0;color:rgba(247,243,237,.38);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">Importe</p>
              <p style="margin:7px 0 0;color:#ffc0ad;font-size:28px;font-weight:900;">${safeAmount}</p>
            </div>
            <div style="padding:16px;border-bottom:1px solid rgba(255,255,255,.08);">
              <p style="margin:0;color:rgba(247,243,237,.38);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">Fecha de pago</p>
              <p style="margin:7px 0 0;color:#fff4ee;font-size:15px;">${safePaidAt}</p>
            </div>
            <div style="padding:16px;">
              <p style="margin:0;color:rgba(247,243,237,.38);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">Período cubierto hasta</p>
              <p style="margin:7px 0 0;color:#fff4ee;font-size:15px;">${safePeriodEnd}</p>
            </div>
          </div>

          <p style="margin:22px 0 0;color:rgba(247,243,237,.35);font-size:12px;line-height:1.55;">
            Referencia Mercado Pago: ${safePreapprovalId}
          </p>
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
        ...(input.paymentId ? { "Idempotency-Key": `subscription-receipt-${input.paymentId}` } : {}),
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject,
        text,
        html,
      }),
    }
  );

  if (!response.ok) {
    const detail =
      await response
        .text()
        .catch(
          () =>
            "No se pudo leer el error de Resend."
        );

    return {
      ok: false,
      error: detail,
    };
  }

  return {
    ok: true,
  };
}
