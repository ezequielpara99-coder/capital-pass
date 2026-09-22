import { notFound } from "next/navigation";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { QUOTE_FIELDS, requireAdminPage } from "../../../../lib/quotes/auth";
import QuoteEditor, { CatalogItem, QuoteClient, QuoteInit } from "../quote-editor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarPresupuestoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();

  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const admin = createAdminClient();
  const { data: quote } = await admin.from("quotes").select(QUOTE_FIELDS).eq("id", id).maybeSingle();
  if (!quote) notFound();

  const [{ data: catalog }, { data: clients }] = await Promise.all([
    admin.from("quote_catalog").select("id, kind, description, unit, unit_price_minor").eq("active", true).order("description"),
    admin.from("quote_clients").select("id, name, contact, phone, email").order("name"),
  ]);

  return (
    <QuoteEditor
      init={{
        ...(quote as unknown as QuoteInit),
        package_price_minor: Number(quote.package_price_minor),
        discount_value: Number(quote.discount_value),
      }}
      catalog={(catalog ?? []) as CatalogItem[]}
      clients={(clients ?? []) as QuoteClient[]}
    />
  );
}
