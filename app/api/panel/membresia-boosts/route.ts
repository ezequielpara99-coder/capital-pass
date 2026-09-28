import { NextRequest, NextResponse } from "next/server";
import { isMissingTable, resolveOrganizer, UUID_RE } from "../../../../lib/panel/organizer";

const FIELDS = "id, name, multiplier, starts_at, ends_at, active";
const MISSING = "Falta aplicar la actualización de la base de datos (20260988).";

function serialize<T extends { multiplier: number | string }>(row: T) {
  return { ...row, multiplier: Number(row.multiplier) };
}

// GET: puntos dobles (o x1.5, x3...) cargados, los mas recientes primero.
export async function GET() {
  try {
    const caller = await resolveOrganizer({ requirePremium: true });
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const { data, error } = await caller.admin
      .from("member_point_boosts")
      .select(FIELDS)
      .eq("organization_id", caller.organizationId)
      .is("deleted_at", null)
      .order("starts_at", { ascending: false })
      .limit(50);

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: MISSING }, { status: 503 });
      console.error("BOOSTS GET:", error);
      return NextResponse.json({ error: "No se pudieron cargar los puntos dobles." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, boosts: (data ?? []).map(serialize) });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// POST { name, multiplier, startsAt, endsAt }: programa un multiplicador de puntos.
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveOrganizer({ requirePremium: true });
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const body = await request.json();
    const name = String(body.name ?? "").trim().slice(0, 80);
    const multiplier = Number(body.multiplier);
    const startsAt = new Date(String(body.startsAt ?? ""));
    const endsAt = new Date(String(body.endsAt ?? ""));

    if (!name) return NextResponse.json({ error: "Ingresá un nombre (por ejemplo: Doble puntos del sábado)." }, { status: 400 });
    if (!Number.isFinite(multiplier) || multiplier <= 1 || multiplier > 10) return NextResponse.json({ error: "El multiplicador tiene que ser mayor a 1 y hasta 10." }, { status: 400 });
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return NextResponse.json({ error: "Indicá desde y hasta cuándo." }, { status: 400 });
    if (endsAt <= startsAt) return NextResponse.json({ error: "El final tiene que ser posterior al inicio." }, { status: 400 });

    const { data, error } = await caller.admin
      .from("member_point_boosts")
      .insert({ organization_id: caller.organizationId, name, multiplier: Math.round(multiplier * 100) / 100, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
      .select(FIELDS)
      .single();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: MISSING }, { status: 503 });
      console.error("BOOSTS POST:", error);
      return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, boost: serialize(data) });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH { id, active }: enciende o apaga un multiplicador sin borrarlo.
export async function PATCH(request: NextRequest) {
  try {
    const caller = await resolveOrganizer({ requirePremium: true });
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const body = await request.json();
    const id = String(body.id ?? "");
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

    const { data, error } = await caller.admin
      .from("member_point_boosts")
      .update({ active: Boolean(body.active) })
      .eq("id", id)
      .eq("organization_id", caller.organizationId)
      .is("deleted_at", null)
      .select(FIELDS)
      .maybeSingle();
    if (error) {
      console.error("BOOSTS PATCH:", error);
      return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
    return NextResponse.json({ ok: true, boost: serialize(data) });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE ?id=: borra un multiplicador (soft-delete, recuperable desde /admin/papelera).
export async function DELETE(request: NextRequest) {
  try {
    const caller = await resolveOrganizer({ requirePremium: true });
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

    const { data, error } = await caller.admin
      .from("member_point_boosts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", caller.organizationId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("BOOSTS DELETE:", error);
      return NextResponse.json({ error: "No se pudo borrar." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
