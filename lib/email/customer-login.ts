type LoginEmailResult = { ok: true } | { ok: false; skipped?: boolean; error: string };

// Mismo remitente/API key que el resto de los emails transaccionales (ver
// lib/email/ticket-delivery.ts). Best-effort: nunca tira excepcion si el
// email no esta configurado.
export async function sendCustomerLoginLink(input: { to: string; loginUrl: string }): Promise<LoginEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TICKETS_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !apiKey.startsWith("re_") || !from) {
    console.warn("CUSTOMER LOGIN - Email no configurado. Definí RESEND_API_KEY y TICKETS_FROM_EMAIL.");
    return { ok: false, skipped: true, error: "Email no configurado." };
  }

  const subject = "Tu acceso a Capital Pass";
  const text = [
    "Hola,",
    "",
    "Entrá con este link para ver tus entradas y tu membresía:",
    input.loginUrl,
    "",
    "El link vale por 15 minutos. Si no lo pediste vos, ignorá este email.",
    "",
    "Capital Pass",
  ].join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#050505;color:#f7f3ed;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:560px;margin:0 auto;padding:34px 22px;">
        <div style="border:1px solid rgba(255,90,42,.24);background:#0a0807;padding:28px;">
          <p style="margin:0 0 18px;color:#ff7354;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;">Capital Pass</p>
          <h1 style="margin:0;color:#fff4ee;font-size:26px;line-height:1.1;text-transform:uppercase;">Tu acceso</h1>
          <p style="margin:20px 0 0;color:rgba(247,243,237,.66);font-size:15px;line-height:1.65;">
            Entrá con este botón para ver tus entradas y tu membresía en un solo lugar.
          </p>
          <p style="margin:26px 0;">
            <a href="${input.loginUrl}" style="display:inline-block;background:#ff2a1a;color:#fff;text-decoration:none;padding:14px 26px;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Entrar</a>
          </p>
          <p style="margin:0;color:rgba(247,243,237,.35);font-size:12px;">El link vale por 15 minutos. Si no lo pediste vos, ignorá este email.</p>
        </div>
      </div>
    </div>
  `;

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: input.to, subject, text, html }),
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
