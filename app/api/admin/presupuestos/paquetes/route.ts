import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { isMissingTable, verifyAdmin } from "../../../../../lib/quotes/auth";
import { normalizeKind, normalizeMoney, normalizePriceMode, sanitizeItems } from "../../../../../lib/quotes/totals";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = "id, kind, name, items, price_mode, package_price_minor, active";

// POST: crea un paquete predeterminado (una plantilla de contenido + precio).
export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Ingresá el nombre del paquete." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("quote_packages")
      .insert({
        kind: normalizeKind(body.kind),
        name: name.slice(0, 200),
        items: sanitizeItems(body.items),
        price_mode: normalizePriceMode(body.priceMode),
        package_price_minor: normalizeMoney(body.packagePrice),
      })
      .select(FIELDS)
      .single();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (paquetes)." }, { status: 503 });
      console.error("PAQUETES POST:", error);
      return NextResponse.json({ error: "No se pudo guardar el paquete." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, package: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH: edita un paquete existente (id en el body) -- por si cambia algo.
export async function PATCH(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const id = String(body.id ?? "");
    if (!UUID.test(id)) return NextResponse.json({ error: "Paquete inválido." }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: "Ingresá el nombre del paquete." }, { status: 400 });
      updates.name = name.slice(0, 200);
    }
    if (body.kind !== undefined) updates.kind = normalizeKind(body.kind);
    if (body.items !== undefined) updates.items = sanitizeItems(body.items);
    if (body.priceMode !== undefined) updates.price_mode = normalizePriceMode(body.priceMode);
    if (body.packagePrice !== undefined) updates.package_price_minor = normalizeMoney(body.packagePrice);
    if (body.active !== undefined) updates.active = Boolean(body.active);

    const admin = createAdminClient();
    const { data, error } = await admin.from("quote_packages").update(updates).eq("id", id).select(FIELDS).maybeSingle();

    if (error) {
      console.error("PAQUETES PATCH:", error);
      return NextResponse.json({ error: "No se pudo guardar el paquete." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el paquete." }, { status: 404 });

    return NextResponse.json({ ok: true, package: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE: borra un paquete predeterminado (?id=...).
export async function DELETE(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!UUID.test(id)) return NextResponse.json({ error: "Paquete inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from("quote_packages").delete().eq("id", id);

    if (error) {
      console.error("PAQUETES DELETE:", error);
      return NextResponse.json({ error: "No se pudo borrar el paquete." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
