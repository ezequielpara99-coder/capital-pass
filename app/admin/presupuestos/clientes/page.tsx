import { createAdminClient } from "../../../../lib/supabase/admin";
import { isMissingTable, requireAdminPage } from "../../../../lib/quotes/auth";
import ClientesClient, { QuoteClient } from "./clientes-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ClientesPresupuestosPage() {
  await requireAdminPage();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("quote_clients")
    .select("id, name, contact, phone, email, notes")
    .order("name");

  if (error && !isMissingTable(error)) console.error("ADMIN CLIENTES:", error);

  return <ClientesClient clients={(data ?? []) as QuoteClient[]} missingSql={isMissingTable(error)} />;
}
