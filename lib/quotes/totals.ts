// Logica pura de presupuestos: items, descuento, totales y formato.
// Los montos son pesos enteros (_minor), igual que el resto de la plataforma.

export const QUOTE_KINDS = ["diseno", "rental", "otro"] as const;
export type QuoteKind = (typeof QUOTE_KINDS)[number];

export const QUOTE_STATUSES = ["borrador", "revision", "a_pagar", "aceptado", "rechazado"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const DISCOUNT_TYPES = ["none", "percent", "amount"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const KIND_LABEL: Record<QuoteKind, string> = {
  diseno: "Diseño",
  rental: "Rental de terminales",
  otro: "Otro",
};

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  borrador: "Borrador",
  revision: "En revisión",
  a_pagar: "A pagar",
  aceptado: "Aceptado",
  rechazado: "Rechazado",
};

export const MODALITIES = ["mensual", "eventual"] as const;
export type Modality = (typeof MODALITIES)[number];

export const MODALITY_LABEL: Record<Modality, string> = {
  mensual: "Cliente mensual",
  eventual: "Fiesta eventual",
};

export const PRICE_MODES = ["items", "package"] as const;
export type PriceMode = (typeof PRICE_MODES)[number];

export const MONTHLY_DISCOUNT_LABEL = "Descuento cliente mensual";

export const UNITS = ["u", "mes", "día", "evento", "hora"] as const;

export type QuoteItem = {
  description: string;
  quantity: number;
  unit: string;
  unit_price_minor: number;
};

export type QuoteTotals = { subtotal: number; discount: number; total: number };

export function itemTotal(item: Pick<QuoteItem, "quantity" | "unit_price_minor">) {
  return Math.round(item.quantity * item.unit_price_minor);
}

// Con precio cerrado (`packagePriceMinor` != null) el subtotal es ese precio y
// los items son solo el detalle del contenido.
export function computeTotals(
  items: Pick<QuoteItem, "quantity" | "unit_price_minor">[],
  discountType: DiscountType,
  discountValue: number,
  packagePriceMinor: number | null = null
): QuoteTotals {
  const subtotal =
    packagePriceMinor !== null
      ? Math.max(0, Math.round(packagePriceMinor))
      : items.reduce((sum, item) => sum + itemTotal(item), 0);
  let discount = 0;

  if (discountType === "percent") discount = Math.round((subtotal * Math.min(discountValue, 100)) / 100);
  if (discountType === "amount") discount = Math.round(discountValue);

  discount = Math.max(0, Math.min(discount, subtotal));
  return { subtotal, discount, total: subtotal - discount };
}

// Acepta cualquier cosa que llegue del cliente y devuelve items validos.
export function sanitizeItems(raw: unknown): QuoteItem[] {
  if (!Array.isArray(raw)) return [];

  const items: QuoteItem[] = [];
  for (const entry of raw.slice(0, 60)) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Record<string, unknown>;
    const description = String(source.description ?? "").trim().slice(0, 300);
    if (!description) continue;

    const quantity = Number(source.quantity);
    const price = Number(source.unit_price_minor);
    items.push({
      description,
      quantity: Number.isFinite(quantity) && quantity > 0 ? Math.min(quantity, 100000) : 1,
      unit: String(source.unit ?? "u").trim().slice(0, 12) || "u",
      unit_price_minor: Number.isFinite(price) && price > 0 ? Math.min(Math.round(price), 1_000_000_000) : 0,
    });
  }
  return items;
}

export function normalizeKind(value: unknown): QuoteKind {
  return (QUOTE_KINDS as readonly string[]).includes(String(value)) ? (value as QuoteKind) : "diseno";
}

export function normalizeStatus(value: unknown): QuoteStatus {
  return (QUOTE_STATUSES as readonly string[]).includes(String(value)) ? (value as QuoteStatus) : "borrador";
}

export function normalizeModality(value: unknown): Modality | null {
  return (MODALITIES as readonly string[]).includes(String(value)) ? (value as Modality) : null;
}

export function normalizePriceMode(value: unknown): PriceMode {
  return value === "package" ? "package" : "items";
}

export function normalizeMoney(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.round(number), 1_000_000_000) : 0;
}

// Cantidad de piezas de contenido (suma de las cantidades de cada linea).
export function contentCount(items: Pick<QuoteItem, "quantity">[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function normalizeDiscount(type: unknown, value: unknown): { type: DiscountType; value: number } {
  const normalizedType = (DISCOUNT_TYPES as readonly string[]).includes(String(type)) ? (type as DiscountType) : "none";
  const number = Number(value);
  if (normalizedType === "none" || !Number.isFinite(number) || number <= 0) return { type: "none", value: 0 };
  return { type: normalizedType, value: normalizedType === "percent" ? Math.min(number, 100) : Math.round(number) };
}

export function quoteCode(number: number) {
  return `P-${String(number).padStart(4, "0")}`;
}

export function formatMoney(amount: number) {
  return `$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(amount))}`;
}

export function formatQuantity(quantity: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(quantity);
}
