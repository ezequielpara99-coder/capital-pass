export type BillingMembership = { organization_id: string; role: string; status: string };

export function destinationFor(members: BillingMembership[]) {
  for (const [role, path] of [["organizer", "/panel"], ["controller", "/control"], ["rrpp", "/rrpp"], ["door_seller", "/puerta"]]) {
    if (members.some((m) => m.status === "active" && m.role === role)) return path;
  }
  return "/cuenta";
}

export function signupFromReference(reference: unknown): string | null {
  if (typeof reference !== "string") return null;
  return /^capitalpass_signup:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(reference)?.[1] ?? null;
}

export function validResourceId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
}

export function safeCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (!/^(www\.)?mercadopago\.com\.ar$/.test(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
}

export type ProviderPayment = {
  id: number | string; status: string; transaction_amount: number;
  transaction_amount_refunded?: number; currency_id: string;
  date_approved: string | null; date_last_updated: string;
  collector_id: number; live_mode: boolean;
};

export function verifiedPayment(payment: ProviderPayment, expected: {
  amount: number; currency: string; collectorId: number; live: boolean;
}) {
  if (!validResourceId(String(payment.id)) || !Number.isFinite(payment.transaction_amount)
    || Math.round(payment.transaction_amount * 100) !== Math.round(expected.amount * 100)
    || payment.currency_id !== expected.currency || payment.collector_id !== expected.collectorId
    || payment.live_mode !== expected.live || !Number.isFinite(Date.parse(payment.date_last_updated))) {
    throw new Error("El cobro no coincide con la suscripcion.");
  }
  if (payment.status === "approved" && (!payment.date_approved || !Number.isFinite(Date.parse(payment.date_approved)))) {
    throw new Error("El cobro no tiene fecha de acreditacion.");
  }
  return {
    status: (payment.transaction_amount_refunded ?? 0) > 0 ? "refunded" : payment.status,
    paidAt: payment.date_approved,
  };
}
