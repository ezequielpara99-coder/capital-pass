import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { isMissingTable, verifyAdmin } from "../../../../../lib/quotes/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = "id, name, category, active, notes, created_at";

// GET: lista los equipos de rental (terminales, etc).
export async function GET() {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const admin = createAdminClient();
    const { data, error } = await admin.from("rental_assets").select(FIELDS).order("name", { ascending: true });

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (calendario de rental)." }, { status: 503 });
      console.error("RENTAL ASSETS GET:", error);
      return NextResponse.json({ error: "No se pudieron cargar los equipos." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, assets: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// POST: crea un equipo.
export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Ingresá un nombre para el equipo." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("rental_assets")
      .insert({
        name: name.slice(0, 200),
        category: String(body.category ?? "terminal").trim().slice(0, 60) || "terminal",
        notes: String(body.notes ?? "").trim().slice(0, 2000) || null,
        created_by: verification.userId,
      })
      .select(FIELDS)
      .single();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (calendario de rental)." }, { status: 503 });
      console.error("RENTAL ASSETS POST:", error);
      return NextResponse.json({ error: "No se pudo crear el equipo." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, asset: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH: edita/activa/desactiva un equipo.
export async function PATCH(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const id = String(body.id ?? "");
    if (!UUID.test(id)) return NextResponse.json({ error: "Equipo inválido." }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: "Ingresá un nombre para el equipo." }, { status: 400 });
      updates.name = name.slice(0, 200);
    }
    if (body.category !== undefined) updates.category = String(body.category).trim().slice(0, 60) || "terminal";
    if (body.notes !== undefined) updates.notes = String(body.notes).trim().slice(0, 2000) || null;
    if (body.active !== undefined) updates.active = Boolean(body.active);

    const admin = createAdminClient();
    const { data, error } = await admin.from("rental_assets").update(updates).eq("id", id).select(FIELDS).maybeSingle();

    if (error) {
      console.error("RENTAL ASSETS PATCH:", error);
      return NextResponse.json({ error: "No se pudo guardar el equipo." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el equipo." }, { status: 404 });

    return NextResponse.json({ ok: true, asset: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
