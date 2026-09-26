import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyAdmin } from "../../../../lib/quotes/auth";
import { quoteCode } from "../../../../lib/quotes/totals";

// Buscador global de la parte de "Capital" (presupuestos/clientes/gastos):
// una sola caja de busqueda que mira varias tablas a la vez, cada una con
// su propio limite chico -- no reemplaza los listados propios de cada
// seccion, es para encontrar algo rapido sin saber en cual esta.
export async function GET(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) return NextResponse.json({ ok: true, results: [] });

    const admin = createAdminClient();
    // El .or() de PostgREST usa "," y "()" como sintaxis propia -- si el
    // termino de busqueda trae esos caracteres (ej. "Juan, Perez") rompe el
    // filtro entero. Se sacan antes de armarlo; perder esos caracteres en
    // la busqueda es un costo minimo comparado con un 500.
    const safeQ = q.replace(/[,()]/g, " ").trim();
    if (safeQ.length < 2) return NextResponse.json({ ok: true, results: [] });
    const like = `%${safeQ}%`;
    const numericQuery = Number(q.replace(/^p-?0*/i, ""));

    const [quotes, clients, expenses, packs, catalog, members, blacklist] = await Promise.all([
      admin.from("quotes").select("id, number, client_name, status").or(`client_name.ilike.${like}${Number.isFinite(numericQuery) && numericQuery > 0 ? `,number.eq.${numericQuery}` : ""}`).limit(8),
      admin.from("quote_clients").select("id, name, contact, phone, email").or(`name.ilike.${like},contact.ilike.${like},email.ilike.${like}`).limit(8),
      admin.from("expenses").select("id, description, amount_minor, expense_date").ilike("description", like).limit(8),
      admin.from("monthly_packs").select("id, client_name, package_price_minor, active").ilike("client_name", like).limit(8),
      admin.from("quote_catalog").select("id, description, unit_price_minor").ilike("description", like).limit(8),
      admin.from("premium_members").select("id, first_name, last_name, dni, member_code").or(`first_name.ilike.${like},last_name.ilike.${like},dni.ilike.${like},member_code.ilike.${like}`).limit(8),
      admin.from("blacklist_entries").select("id, dni, full_name").or(`dni.ilike.${like},full_name.ilike.${like}`).limit(8),
    ]);

    const results = [
      ...(quotes.data ?? []).map((row) => ({
        type: "presupuesto" as const,
        label: `${row.client_name} · ${quoteCode(row.number)}`,
        sub: row.status,
        href: `/admin/presupuestos/${row.id}`,
      })),
      ...(clients.data ?? []).map((row) => ({
        type: "cliente" as const,
        label: row.name,
        sub: [row.contact, row.phone, row.email].filter(Boolean).join(" · ") || null,
        href: `/admin/presupuestos/clientes`,
      })),
      ...(expenses.data ?? []).map((row) => ({
        type: "gasto" as const,
        label: row.description,
        sub: row.expense_date,
        href: `/admin/finanzas`,
      })),
      ...(packs.data ?? []).map((row) => ({
        type: "pack mensual" as const,
        label: row.client_name,
        sub: row.active ? "Activo" : "Inactivo",
        href: `/admin/presupuestos/mensuales`,
      })),
      ...(catalog.data ?? []).map((row) => ({
        type: "catálogo" as const,
        label: row.description,
        sub: null,
        href: `/admin/presupuestos/catalogo`,
      })),
      ...(members.data ?? []).map((row) => ({
        type: "socio premium" as const,
        label: `${row.first_name} ${row.last_name}`,
        sub: `Código ${row.member_code}${row.dni ? ` · DNI ${row.dni}` : ""}`,
        href: `/panel/membresia`,
      })),
      ...(blacklist.data ?? []).map((row) => ({
        type: "lista negra" as const,
        label: row.full_name || "Sin nombre",
        sub: `DNI ${row.dni}`,
        href: `/panel/lista-negra`,
      })),
    ];

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error("BUSCAR GET:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
