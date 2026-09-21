import { createAdminClient } from "../../../../lib/supabase/admin";
import { isMissingTable, requireAdminPage } from "../../../../lib/quotes/auth";
import CatalogClient from "./catalog-client";
import type { CatalogItem } from "../quote-editor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CatalogoPresupuestosPage() {
  await requireAdminPage();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("quote_catalog")
    .select("id, kind, description, unit, unit_price_minor")
    .eq("active", true)
    .order("kind")
    .order("description");

  if (error && !isMissingTable(error)) console.error("ADMIN CATALOGO:", error);

  return <CatalogClient items={(data ?? []) as CatalogItem[]} missingSql={isMissingTable(error)} />;
}
