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

  return <PresupuestosClient quotes={(data ?? []) as QuoteRow[]} missingSql={isMissingTable(error)} />;
}
