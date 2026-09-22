import { createAdminClient } from "../../../../lib/supabase/admin";
import { requireAdminPage } from "../../../../lib/quotes/auth";
import { normalizeKind } from "../../../../lib/quotes/totals";
import QuoteEditor, { CatalogItem, QuoteClient, QuoteInit, QuotePackageOption } from "../quote-editor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NuevoPresupuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; consulta?: string }>;
}) {
  await requireAdminPage();

  const params = await searchParams;
  const admin = createAdminClient();

  let init: QuoteInit = { kind: normalizeKind(params.tipo) };

  // Presupuesto de rentals armado a partir de una consulta de la landing.
  if (params.consulta && UUID.test(params.consulta)) {
    const { data: inquiry } = await admin
      .from("rental_inquiries")
      .select("id, business_name, contact_name, phone, email, terminal_quantity")
      .eq("id", params.consulta)
      .maybeSingle();

    if (inquiry) {
      const quantity = Number(String(inquiry.terminal_quantity ?? "").match(/\d+/)?.[0]);
      init = {
        kind: "rental",
        client_name: inquiry.business_name,
        client_contact: inquiry.contact_name,
        client_phone: inquiry.phone,
        client_email: inquiry.email,
        title: "Alquiler de terminales de pago",
        items: [
          {
            description: "Alquiler de terminal de pago",
            quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
            unit: "mes",
            unit_price_minor: 0,
          },
        ],
        price_mode: "items",
        rental_inquiry_id: inquiry.id,
      };
    }
  }

  const [{ data: catalog }, { data: clients }, { data: packages }] = await Promise.all([
    admin.from("quote_catalog").select("id, kind, description, unit, unit_price_minor").eq("active", true).order("description"),
    admin.from("quote_clients").select("id, name, contact, phone, email").order("name"),
    admin.from("quote_packages").select("id, kind, name, items, price_mode, package_price_minor").eq("active", true).order("name"),
  ]);

  return (
    <QuoteEditor
      init={init}
      catalog={(catalog ?? []) as CatalogItem[]}
      clients={(clients ?? []) as QuoteClient[]}
      packages={(packages ?? []) as QuotePackageOption[]}
    />
  );
}
