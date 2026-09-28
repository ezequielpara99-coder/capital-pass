import { NextRequest, NextResponse } from "next/server";
import { isMissingTable, resolveOrganizer, UUID_RE } from "../../../../lib/panel/organizer";

const FIELDS = "id, name, min_points, discount_percent, perk";
const MISSING = "Falta aplicar la actualización de la base de datos (20260988).";

// GET: niveles de socio del boliche, del menor al mayor.
export async function GET() {
  try {
    const caller = await resolveOrganizer({ requirePremium: true });
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const { data, error } = await caller.admin
      .from("member_levels")
      .select(FIELDS)
      .eq("organization_id", caller.organizationId)
      .is("deleted_at", null)
      .order("min_points", { ascending: true })
      .limit(50);

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: MISSING }, { status: 503 });
      console.error("NIVELES GET:", error);
      return NextResponse.json({ error: "No se pudieron cargar los niveles." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, levels: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// POST: agrega un nivel { name, minPoints, discountPercent, perk }.
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveOrganizer({ requirePremium: true });
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const body = await request.json();
    const name = String(body.name ?? "").trim().slice(0, 60);
    const minPoints = Math.round(Number(body.minPoints));
    const discount = Math.round(Number(body.discountPercent ?? 0));
    if (!name) return NextResponse.json({ error: "Ingresá el nombre del nivel." }, { status: 400 });
    if (!Number.isFinite(minPoints) || minPoints < 0 || minPoints > 10_000_000) return NextResponse.json({ error: "Puntos inválidos." }, { status: 400 });
    if (!Number.isFinite(discount) || discount < 0 || discount > 50) return NextResponse.json({ error: "El descuento tiene que estar entre 0 y 50%." }, { status: 400 });

    const { data, error } = await caller.admin
      .from("member_levels")
      .insert({
        organization_id: caller.organizationId,
        name,
        min_points: minPoints,
        discount_percent: discount,
        perk: String(body.perk ?? "").trim().slice(0, 200) || null,
      })
      .select(FIELDS)
      .single();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: MISSING }, { status: 503 });
      if (error.code === "23505") return NextResponse.json({ error: "Ya hay un nivel que empieza en esos puntos." }, { status: 409 });
      console.error("NIVELES POST:", error);
      return NextResponse.json({ error: "No se pudo guardar el nivel." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, level: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE ?id=: quita un nivel (soft-delete, recuperable desde /admin/papelera).
export async function DELETE(request: NextRequest) {
  try {
    const caller = await resolveOrganizer({ requirePremium: true });
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Nivel inválido." }, { status: 400 });

    const { data, error } = await caller.admin
      .from("member_levels")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", caller.organizationId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("NIVELES DELETE:", error);
      return NextResponse.json({ error: "No se pudo borrar." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el nivel." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
