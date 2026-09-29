import { createAdminClient } from "../../../lib/supabase/admin";
import { isMissingTable, requireAdminPage } from "../../../lib/quotes/auth";
import { fetchAllRows } from "../../../lib/supabase/fetch-all";
import PresupuestosClient, { QuoteRow } from "./presupuestos-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPresupuestosPage() {
  await requireAdminPage();

  const admin = createAdminClient();
  // fetchAllRows: el ".limit(300)" que tenia antes esta consulta escondia
  // (sin ningun aviso, ni en la lista ni en el buscador que filtra en
  // memoria sobre lo ya traido) cualquier presupuesto mas viejo que el
  // #300 por fecha de creacion -- seguia existiendo y editable por URL
  // directa, pero invisible desde el listado.
  const { data, error } = await fetchAllRows((from, to) =>
    admin
      .from("quotes")
      .select("id, number, kind, status, client_name, event_name, modality, items, price_mode, package_price_minor, discount_type, discount_value, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)
  );

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
