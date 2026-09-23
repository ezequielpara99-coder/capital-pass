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

  // unit_price_minor es bigint: PostgREST lo serializa como string, no
  // como number -- normalizamos aca para que un item gratuito (precio 0)
  // no llegue como el string "0" (truthy en JS) al cliente.
  const items = (data ?? []).map((item) => ({ ...item, unit_price_minor: Number(item.unit_price_minor) }));

  return <CatalogClient items={items as CatalogItem[]} missingSql={isMissingTable(error)} />;
}
