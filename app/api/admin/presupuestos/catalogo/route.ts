import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { isMissingTable, verifyAdmin } from "../../../../../lib/quotes/auth";
import { normalizeKind } from "../../../../../lib/quotes/totals";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = "id, kind, description, unit, unit_price_minor, active";

function price(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(Math.round(number), 1_000_000_000) : 0;
}

// POST: agrega un item al catalogo.
export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const description = String(body.description ?? "").trim().slice(0, 300);
    if (!description) return NextResponse.json({ error: "Ingresá la descripción." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("quote_catalog")
      .insert({
        kind: normalizeKind(body.kind),
        description,
        unit: String(body.unit ?? "u").trim().slice(0, 12) || "u",
        unit_price_minor: price(body.unitPrice),
      })
      .select(FIELDS)
      .single();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (presupuestos)." }, { status: 503 });
      console.error("CATALOGO POST:", error);
      return NextResponse.json({ error: "No se pudo guardar el item." }, { status: 500 });
    }

    await admin.from("quote_catalog_price_history").insert({ catalog_id: data.id, unit_price_minor: data.unit_price_minor, changed_by: verification.userId });

    return NextResponse.json({ ok: true, item: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH: edita un item del catalogo (id en el body).
export async function PATCH(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const id = String(body.id ?? "");
    if (!UUID.test(id)) return NextResponse.json({ error: "Item inválido." }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (body.description !== undefined) {
      const description = String(body.description).trim().slice(0, 300);
      if (!description) return NextResponse.json({ error: "Ingresá la descripción." }, { status: 400 });
      updates.description = description;
    }
    if (body.kind !== undefined) updates.kind = normalizeKind(body.kind);
    if (body.unit !== undefined) updates.unit = String(body.unit).trim().slice(0, 12) || "u";
    if (body.unitPrice !== undefined) updates.unit_price_minor = price(body.unitPrice);

    const admin = createAdminClient();

    // Si cambia el precio, deja el punto anterior fijado en el historial
    // antes de pisarlo -- así la línea de tiempo queda completa.
    if (updates.unit_price_minor !== undefined) {
      const { data: current } = await admin.from("quote_catalog").select("unit_price_minor").eq("id", id).maybeSingle();
      if (current && Number(current.unit_price_minor) !== updates.unit_price_minor) {
        await admin.from("quote_catalog_price_history").insert({ catalog_id: id, unit_price_minor: updates.unit_price_minor, changed_by: verification.userId });
      }
    }

    const { data, error } = await admin.from("quote_catalog").update(updates).eq("id", id).select(FIELDS).maybeSingle();

    if (error) {
      console.error("CATALOGO PATCH:", error);
      return NextResponse.json({ error: "No se pudo guardar el item." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el item." }, { status: 404 });

    return NextResponse.json({ ok: true, item: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE: borra un item del catalogo (?id=...).
export async function DELETE(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!UUID.test(id)) return NextResponse.json({ error: "Item inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from("quote_catalog").delete().eq("id", id);

    if (error) {
      console.error("CATALOGO DELETE:", error);
      return NextResponse.json({ error: "No se pudo borrar el item." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
