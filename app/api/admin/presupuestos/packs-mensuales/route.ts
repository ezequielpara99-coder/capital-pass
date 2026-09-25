import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { isMissingTable, verifyAdmin } from "../../../../../lib/quotes/auth";
import { normalizeKind, normalizeMoney } from "../../../../../lib/quotes/totals";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = "id, client_name, client_contact, client_phone, client_email, kind, description, package_price_minor, active, notes, created_at";

function optionalText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max) || null;
}

// GET: lista los packs mensuales, con el ultimo periodo ya facturado de cada uno.
export async function GET() {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const admin = createAdminClient();
    const { data: packs, error } = await admin.from("monthly_packs").select(FIELDS).order("active", { ascending: false }).order("client_name", { ascending: true });

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (packs mensuales)." }, { status: 503 });
      console.error("PACKS MENSUALES GET:", error);
      return NextResponse.json({ error: "No se pudieron cargar los packs." }, { status: 500 });
    }

    const packIds = (packs ?? []).map((p) => p.id);
    const periodsByPack = new Map<string, { period: string; quoteId: string; status: string; number: number }[]>();

    if (packIds.length > 0) {
      const { data: quotes } = await admin
        .from("quotes")
        .select("id, number, monthly_pack_id, pack_period, status")
        .in("monthly_pack_id", packIds)
        .order("pack_period", { ascending: false });

      for (const quote of quotes ?? []) {
        if (!quote.monthly_pack_id || !quote.pack_period) continue;
        const list = periodsByPack.get(quote.monthly_pack_id) ?? [];
        list.push({ period: quote.pack_period, quoteId: quote.id, status: quote.status, number: quote.number });
        periodsByPack.set(quote.monthly_pack_id, list);
      }
    }

    const result = (packs ?? []).map((pack) => ({
      ...pack,
      package_price_minor: Number(pack.package_price_minor),
      periods: periodsByPack.get(pack.id) ?? [],
    }));

    return NextResponse.json({ ok: true, packs: result });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// POST: crea un pack mensual nuevo.
export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const clientName = String(body.clientName ?? "").trim();
    if (!clientName) return NextResponse.json({ error: "Ingresá el nombre del cliente." }, { status: 400 });

    const price = normalizeMoney(body.packagePrice);
    if (price <= 0) return NextResponse.json({ error: "Ingresá el monto mensual." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("monthly_packs")
      .insert({
        client_name: clientName.slice(0, 200),
        client_contact: optionalText(body.clientContact, 200),
        client_phone: optionalText(body.clientPhone, 60),
        client_email: optionalText(body.clientEmail, 200),
        kind: normalizeKind(body.kind),
        description: optionalText(body.description, 2000),
        package_price_minor: price,
        notes: optionalText(body.notes, 2000),
        created_by: verification.userId,
      })
      .select(FIELDS)
      .single();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (packs mensuales)." }, { status: 503 });
      console.error("PACKS MENSUALES POST:", error);
      return NextResponse.json({ error: "No se pudo guardar el pack." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, pack: { ...data, package_price_minor: Number(data.package_price_minor), periods: [] } });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH: edita un pack (id en el body) -- tambien se usa para activar/desactivar.
export async function PATCH(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const id = String(body.id ?? "");
    if (!UUID.test(id)) return NextResponse.json({ error: "Pack inválido." }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.clientName !== undefined) {
      const name = String(body.clientName).trim();
      if (!name) return NextResponse.json({ error: "Ingresá el nombre del cliente." }, { status: 400 });
      updates.client_name = name.slice(0, 200);
    }
    if (body.clientContact !== undefined) updates.client_contact = optionalText(body.clientContact, 200);
    if (body.clientPhone !== undefined) updates.client_phone = optionalText(body.clientPhone, 60);
    if (body.clientEmail !== undefined) updates.client_email = optionalText(body.clientEmail, 200);
    if (body.kind !== undefined) updates.kind = normalizeKind(body.kind);
    if (body.description !== undefined) updates.description = optionalText(body.description, 2000);
    if (body.packagePrice !== undefined) updates.package_price_minor = normalizeMoney(body.packagePrice);
    if (body.notes !== undefined) updates.notes = optionalText(body.notes, 2000);
    if (body.active !== undefined) updates.active = Boolean(body.active);

    const admin = createAdminClient();
    const { data, error } = await admin.from("monthly_packs").update(updates).eq("id", id).select(FIELDS).maybeSingle();

    if (error) {
      console.error("PACKS MENSUALES PATCH:", error);
      return NextResponse.json({ error: "No se pudo guardar el pack." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el pack." }, { status: 404 });

    return NextResponse.json({ ok: true, pack: { ...data, package_price_minor: Number(data.package_price_minor) } });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE: borra un pack (?id=) -- solo si nunca se generó ninguna factura con el (si ya tiene historial, desactivalo en vez de borrarlo).
export async function DELETE(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!UUID.test(id)) return NextResponse.json({ error: "Pack inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { count } = await admin.from("quotes").select("id", { count: "exact", head: true }).eq("monthly_pack_id", id);
    if (count && count > 0) {
      return NextResponse.json({ error: "Este pack ya generó facturas -- desactivalo en vez de borrarlo, para no perder el historial." }, { status: 409 });
    }

    const { error } = await admin.from("monthly_packs").delete().eq("id", id);
    if (error) {
      console.error("PACKS MENSUALES DELETE:", error);
      return NextResponse.json({ error: "No se pudo borrar el pack." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
