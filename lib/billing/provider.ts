import "server-only";
import { getPlatformMercadoPago } from "../mercadopago/server";
import { validResourceId, type ProviderPayment } from "./rules";

export type Invoice = {
  id: number | string; preapproval_id: string; debit_date?: string;
  payment?: { id?: number | string; status?: string };
};

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

export function getPreapproval(id: string) {
  resource(id);
  return getPlatformMercadoPago().preApproval.get({ id });
}

export function getPayment(id: string) { return get<ProviderPayment>(`/v1/payments/${resource(id)}`); }
export function getInvoice(id: string) { return get<Invoice>(`/authorized_payments/${resource(id)}`); }

export async function invoicesFor(filter: { preapproval_id: string } | { payment_id: string }) {
  const params = new URLSearchParams({ ...filter, limit: "100" });
  const all: Invoice[] = [];
  // Incluye las renovaciones; nunca usa solo la primera pagina del historial.
  for (let offset = 0; offset < 1000; offset += 100) {
    params.set("offset", String(offset));
    const page = await get<{ results?: Invoice[]; paging?: { total?: number } }>(`/authorized_payments/search?${params}`);
    const results = page.results ?? [];
    all.push(...results);
    if (results.length < 100 || offset + results.length >= (page.paging?.total ?? Infinity)) return all;
  }
  throw new Error("El historial requiere una conciliacion adicional.");
}
