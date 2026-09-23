import { createAdminClient } from "../../../../lib/supabase/admin";
import { isMissingTable, requireAdminPage } from "../../../../lib/quotes/auth";
import PaquetesClient, { QuotePackage } from "./paquetes-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PaquetesPresupuestosPage() {
  await requireAdminPage();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("quote_packages")
    .select("id, kind, name, items, price_mode, package_price_minor, notes, active")
    .order("kind")
    .order("name");

  if (error && !isMissingTable(error)) console.error("ADMIN PAQUETES:", error);

  // package_price_minor es bigint: PostgREST lo serializa como string, no
  // como number -- normalizamos aca para que un paquete gratuito (precio
  // 0) no llegue como el string "0" (truthy en JS) al cliente.
  const packages = (data ?? []).map((pkg) => ({ ...pkg, package_price_minor: Number(pkg.package_price_minor) }));

  return <PaquetesClient packages={packages as QuotePackage[]} missingSql={isMissingTable(error)} />;
}
