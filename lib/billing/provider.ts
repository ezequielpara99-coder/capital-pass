import "server-only";
import { validResourceId, type ProviderPayment } from "./rules";

async function get<T>(path: string): Promise<T> {
  const token = process.env.MERCADOPAGO_PLATFORM_ACCESS_TOKEN?.trim();
  if (!token || /ACA_VA|TU_ACCESS|tu_api/.test(token)) throw new Error("Credenciales de pago sin configurar.");
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`No se pudo consultar Mercado Pago (${response.status}).`);
  return response.json() as Promise<T>;
}

function resource(value: string) {
  if (!validResourceId(value)) throw new Error("Referencia de pago invalida.");
  return encodeURIComponent(value);
}

export function getPayment(id: string) { return get<ProviderPayment>(`/v1/payments/${resource(id)}`); }

let cachedCollectorId: number | null = null;

// El id de nuestra propia cuenta de cobro, para verificar que un pago
// reportado por Mercado Pago efectivamente nos pertenece a nosotros.
export async function getPlatformCollectorId() {
  if (cachedCollectorId != null) return cachedCollectorId;
  const me = await get<{ id: number }>("/users/me");
  cachedCollectorId = me.id;
  return me.id;
}

// Busca pagos de Checkout Pro por external_reference (formato
// "capitalpass_signup:<uuid>" o "capitalpass_upgrade:<uuid>"). Se usa
// tanto desde el webhook como desde "Verificar mi pago" para reconciliar
// sin depender de una notificacion.
export async function paymentsForReference(externalReference: string) {
  if (!/^capitalpass_(signup|upgrade):[0-9a-f-]{36}$/i.test(externalReference)) throw new Error("Referencia invalida.");
  const params = new URLSearchParams({ external_reference: externalReference, sort: "date_created", criteria: "desc" });
  const page = await get<{ results?: ProviderPayment[] }>(`/v1/payments/search?${params}`);
  return page.results ?? [];
}
