import { createAdminClient } from "../../../lib/supabase/admin";
import { isMissingTable, requireAdminPage } from "../../../lib/quotes/auth";
import PresupuestosClient, { QuoteRow } from "./presupuestos-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPresupuestosPage() {
  await requireAdminPage();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("quotes")
    .select("id, number, kind, status, client_name, event_name, modality, items, price_mode, package_price_minor, discount_type, discount_value, created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error && !isMissingTable(error)) console.error("ADMIN PRESUPUESTOS:", error);

  // package_price_minor es bigint y discount_value es numeric: PostgREST
  // los serializa como string, no como number (mismo patron ya corregido
  // en catalogo/paquetes/el editor) -- se normaliza aca para que el tipo
  // declarado de QuoteRow sea cierto en runtime tambien.
  const normalizedQuotes = (data ?? []).map((quote) => ({
    ...quote,
    package_price_minor: Number(quote.package_price_minor),
    discount_value: Number(quote.discount_value),
  }));

  return <PresupuestosClient quotes={normalizedQuotes as QuoteRow[]} missingSql={isMissingTable(error)} />;
}
