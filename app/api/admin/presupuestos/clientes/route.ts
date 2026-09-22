import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { isMissingTable, verifyAdmin } from "../../../../../lib/quotes/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = "id, name, contact, phone, email, notes";

function optionalText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max) || null;
}

// POST: agrega un cliente al directorio.
export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Ingresá el nombre del cliente." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("quote_clients")
      .insert({
        name: name.slice(0, 200),
        contact: optionalText(body.contact, 200),
        phone: optionalText(body.phone, 60),
        email: optionalText(body.email, 200),
        notes: optionalText(body.notes, 1000),
      })
      .select(FIELDS)
      .single();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (directorio de clientes)." }, { status: 503 });
      console.error("CLIENTES POST:", error);
      return NextResponse.json({ error: "No se pudo guardar el cliente." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, client: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH: edita un cliente del directorio (id en el body).
export async function PATCH(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const id = String(body.id ?? "");
    if (!UUID.test(id)) return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: "Ingresá el nombre del cliente." }, { status: 400 });
      updates.name = name.slice(0, 200);
    }
    if (body.contact !== undefined) updates.contact = optionalText(body.contact, 200);
    if (body.phone !== undefined) updates.phone = optionalText(body.phone, 60);
    if (body.email !== undefined) updates.email = optionalText(body.email, 200);
    if (body.notes !== undefined) updates.notes = optionalText(body.notes, 1000);

    const admin = createAdminClient();
    const { data, error } = await admin.from("quote_clients").update(updates).eq("id", id).select(FIELDS).maybeSingle();

    if (error) {
      console.error("CLIENTES PATCH:", error);
      return NextResponse.json({ error: "No se pudo guardar el cliente." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el cliente." }, { status: 404 });

    return NextResponse.json({ ok: true, client: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE: borra un cliente del directorio (?id=...).
export async function DELETE(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!UUID.test(id)) return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from("quote_clients").delete().eq("id", id);

    if (error) {
      console.error("CLIENTES DELETE:", error);
      return NextResponse.json({ error: "No se pudo borrar el cliente." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
