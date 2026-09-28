import { NextRequest, NextResponse } from "next/server";
import { isMissingTable, resolveOrganizer, UUID_RE } from "../../../../lib/panel/organizer";

const FIELDS = "id, kind, name, description, price_minor, points_earned, points_cost, active, sort_order";
const KINDS = ["trago", "combo", "premio"] as const;
type Kind = (typeof KINDS)[number];

const MISSING = "Falta aplicar la actualización de la base de datos de la app del socio (20260982).";

function serialize<T extends { price_minor: number | string }>(row: T) {
  return { ...row, price_minor: Number(row.price_minor) };
}

function parseAmount(value: unknown) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

// GET: la carta completa del boliche (activos e inactivos) + los puntos por asistencia.
export async function GET() {
  try {
    const caller = await resolveOrganizer({ requirePremium: true });
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const [items, org] = await Promise.all([
      caller.admin.from("member_menu_items").select(FIELDS).eq("organization_id", caller.organizationId).is("deleted_at", null).order("kind").order("sort_order").order("created_at").limit(500),
      caller.admin.from("organizations").select("member_checkin_points").eq("id", caller.organizationId).maybeSingle(),
    ]);

    const failure = items.error ?? org.error;
    if (failure) {
      if (isMissingTable(failure)) return NextResponse.json({ error: MISSING }, { status: 503 });
      console.error("MEMBRESIA CARTA GET:", failure);
      return NextResponse.json({ error: "No se pudo cargar la carta." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      items: (items.data ?? []).map(serialize),
      checkinPoints: Number(org.data?.member_checkin_points ?? 0),
    });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// POST: agrega un producto/premio a la carta.
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveOrganizer({ requirePremium: true });
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const body = await request.json();
    const kind = String(body.kind ?? "") as Kind;
    const name = String(body.name ?? "").trim().slice(0, 120);
    if (!KINDS.includes(kind)) return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Ingresá el nombre." }, { status: 400 });

    const row: Record<string, unknown> = {
      organization_id: caller.organizationId,
      kind,
      name,
      description: String(body.description ?? "").trim().slice(0, 300) || null,
    };

    if (kind === "premio") {
      const cost = parseAmount(body.pointsCost);
      if (!Number.isFinite(cost) || cost <= 0) return NextResponse.json({ error: "Indicá cuántos puntos cuesta el premio." }, { status: 400 });
      row.points_cost = cost;
      row.price_minor = 0;
      row.points_earned = 0;
    } else {
      const price = parseAmount(body.price);
      const earned = parseAmount(body.pointsEarned ?? 0);
      if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: "Ingresá un precio válido." }, { status: 400 });
      if (!Number.isFinite(earned)) return NextResponse.json({ error: "Puntos inválidos." }, { status: 400 });
      row.price_minor = price;
      row.points_earned = earned;
    }

    const { data, error } = await caller.admin.from("member_menu_items").insert(row).select(FIELDS).single();
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: MISSING }, { status: 503 });
      console.error("MEMBRESIA CARTA POST:", error);
      return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: serialize(data) });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH: edita un item (id en el body), o los puntos por asistencia ({ checkinPoints }).
export async function PATCH(request: NextRequest) {
  try {
    const caller = await resolveOrganizer({ requirePremium: true });
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const body = await request.json();

    if (body.checkinPoints !== undefined) {
      const points = parseAmount(body.checkinPoints);
      if (!Number.isFinite(points) || points > 100000) return NextResponse.json({ error: "Puntos inválidos." }, { status: 400 });
      const { error } = await caller.admin.from("organizations").update({ member_checkin_points: points }).eq("id", caller.organizationId);
      if (error) {
        console.error("MEMBRESIA CARTA CHECKIN:", error);
        return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
      }
      return NextResponse.json({ ok: true, checkinPoints: points });
    }

    const id = String(body.id ?? "");
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Item inválido." }, { status: 400 });

    const { data: current } = await caller.admin.from("member_menu_items").select("kind").eq("id", id).eq("organization_id", caller.organizationId).is("deleted_at", null).maybeSingle();
    if (!current) return NextResponse.json({ error: "No se encontró el item." }, { status: 404 });

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim().slice(0, 120);
      if (!name) return NextResponse.json({ error: "Ingresá el nombre." }, { status: 400 });
      updates.name = name;
    }
    if (body.description !== undefined) updates.description = String(body.description).trim().slice(0, 300) || null;
    if (body.active !== undefined) updates.active = Boolean(body.active);
    if (current.kind === "premio") {
      if (body.pointsCost !== undefined) {
        const cost = parseAmount(body.pointsCost);
        if (!Number.isFinite(cost) || cost <= 0) return NextResponse.json({ error: "Puntos inválidos." }, { status: 400 });
        updates.points_cost = cost;
      }
    } else {
      if (body.price !== undefined) {
        const price = parseAmount(body.price);
        if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: "Precio inválido." }, { status: 400 });
        updates.price_minor = price;
      }
      if (body.pointsEarned !== undefined) {
        const earned = parseAmount(body.pointsEarned);
        if (!Number.isFinite(earned)) return NextResponse.json({ error: "Puntos inválidos." }, { status: 400 });
        updates.points_earned = earned;
      }
    }
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No hay cambios." }, { status: 400 });

    const { data, error } = await caller.admin.from("member_menu_items").update(updates).eq("id", id).eq("organization_id", caller.organizationId).is("deleted_at", null).select(FIELDS).maybeSingle();
    if (error) {
      console.error("MEMBRESIA CARTA PATCH:", error);
      return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el item." }, { status: 404 });

    return NextResponse.json({ ok: true, item: serialize(data) });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE: saca un item de la carta (?id=) -- soft-delete, recuperable desde /admin/papelera.
export async function DELETE(request: NextRequest) {
  try {
    const caller = await resolveOrganizer({ requirePremium: true });
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Item inválido." }, { status: 400 });

    const { data, error } = await caller.admin
      .from("member_menu_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", caller.organizationId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("MEMBRESIA CARTA DELETE:", error);
      return NextResponse.json({ error: "No se pudo borrar." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el item." }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
