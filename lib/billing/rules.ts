export type BillingMembership = { organization_id: string; role: string; status: string };

export function destinationFor(members: BillingMembership[]) {
  for (const [role, path] of [["organizer", "/panel"], ["controller", "/control"], ["rrpp", "/rrpp"], ["door_seller", "/puerta"], ["bartender", "/bartender"]]) {
    if (members.some((m) => m.status === "active" && m.role === role)) return path;
  }
  return "/cuenta";
}

// Con el servicio activo se puede renovar desde estos dias antes del
// vencimiento (mismo limite que cp_prepare_checkout en la base). Lo que se
// paga se suma al final del periodo vigente.
export const RENEWAL_WINDOW_DAYS = 7;

export function isRenewable(account: { active: boolean; organizationId: string | null; complimentary: boolean; periodEnd: string | null }, now = Date.now()) {
  if (!account.active || !account.organizationId || account.complimentary || !account.periodEnd) return false;
  const end = Date.parse(account.periodEnd);
  return Number.isFinite(end) && end - now <= RENEWAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

export function signupFromReference(reference: unknown): string | null {
  if (typeof reference !== "string") return null;
  return /^capitalpass_signup:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(reference)?.[1] ?? null;
}

export function saleFromReference(reference: unknown): string | null {
  if (typeof reference !== "string") return null;
  return /^capitalpass_sale:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(reference)?.[1] ?? null;
}

export function topupFromReference(reference: unknown): string | null {
  if (typeof reference !== "string") return null;
  return /^capitalpass_topup:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(reference)?.[1] ?? null;
}

export function upgradeChargeFromReference(reference: unknown): string | null {
  if (typeof reference !== "string") return null;
  return /^capitalpass_upgrade:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(reference)?.[1] ?? null;
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
  collector_id: number; live_mode: boolean; external_reference?: string | null;
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
