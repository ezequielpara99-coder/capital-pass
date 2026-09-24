import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { verifyAdmin } from "../../../../../lib/quotes/auth";

// GET: catálogo + clientes + paquetes en un solo viaje -- lo que antes
// resolvían nuevo/page.tsx y [id]/page.tsx server-side. Se usa tanto para
// pintar el editor online como para refrescar el cache local (IndexedDB)
// que lo reemplaza cuando no hay señal.
export async function GET() {
  const verification = await verifyAdmin();
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

  const admin = createAdminClient();
  const [{ data: catalog }, { data: clients }, { data: packages }] = await Promise.all([
    admin.from("quote_catalog").select("id, kind, description, unit, unit_price_minor").eq("active", true).order("description"),
    admin.from("quote_clients").select("id, name, contact, phone, email").order("name"),
    admin.from("quote_packages").select("id, kind, name, items, price_mode, package_price_minor, notes").eq("active", true).order("name"),
  ]);

  // unit_price_minor/package_price_minor son bigint: PostgREST los
  // serializa como string, no number (mismo motivo por el que las páginas
  // server-side ya normalizaban esto antes de este endpoint existir).
  const normalizedCatalog = (catalog ?? []).map((item) => ({
    ...item,
    unit_price_minor: Number(item.unit_price_minor),
  }));
  const normalizedPackages = (packages ?? []).map((pkg) => ({
    ...pkg,
    package_price_minor: Number(pkg.package_price_minor),
  }));

  return NextResponse.json({
    ok: true,
    catalog: normalizedCatalog,
    clients: clients ?? [],
    packages: normalizedPackages,
  });
}
