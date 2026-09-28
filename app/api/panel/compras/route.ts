import { NextRequest, NextResponse } from "next/server";
import { isMissingTable, resolveOrganizer, UUID_RE } from "../../../../lib/panel/organizer";

const FIELDS = "id, supplier, description, total_minor, purchased_on, payment_method, notes, created_at";
const MISSING = "Falta aplicar la actualización de la base de datos (20260982).";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function serialize<T extends { total_minor: number | string }>(row: T) {
  return { ...row, total_minor: Number(row.total_minor) };
}

// GET: compras del organizador. ?month=YYYY-MM (default: mes en curso).
export async function GET(request: NextRequest) {
  try {
    const caller = await resolveOrganizer();
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const nowAr = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const month = request.nextUrl.searchParams.get("month") ?? nowAr.toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "Mes inválido." }, { status: 400 });

    const [year, monthIndex] = month.split("-").map(Number);
    const from = `${month}-01`;
    const nextMonth = monthIndex === 12 ? `${year + 1}-01-01` : `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;

    const { data, error } = await caller.admin
      .from("organization_purchases")
      .select(FIELDS)
      .eq("organization_id", caller.organizationId)
      .is("deleted_at", null)
      .gte("purchased_on", from)
      .lt("purchased_on", nextMonth)
      .order("purchased_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: MISSING }, { status: 503 });
      console.error("COMPRAS GET:", error);
      return NextResponse.json({ error: "No se pudieron cargar las compras." }, { status: 500 });
    }

    const purchases = (data ?? []).map(serialize);
    const total = purchases.reduce((sum, p) => sum + p.total_minor, 0);

    // Top proveedores del mes.
    const bySupplier = new Map<string, number>();
    for (const p of purchases) {
      const key = (p.supplier as string | null)?.trim() || "Sin proveedor";
      bySupplier.set(key, (bySupplier.get(key) ?? 0) + p.total_minor);
    }
    const suppliers = [...bySupplier.entries()].map(([name, totalMinor]) => ({ name, totalMinor })).sort((a, b) => b.totalMinor - a.totalMinor).slice(0, 5);

    return NextResponse.json({ ok: true, month, purchases, totalMinor: total, suppliers });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// POST: registra una compra.
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveOrganizer();
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const body = await request.json();
    const description = String(body.description ?? "").trim().slice(0, 200);
    const total = Math.round(Number(body.total));
    const purchasedOn = String(body.purchasedOn ?? "");
    if (!description) return NextResponse.json({ error: "Ingresá qué compraste." }, { status: 400 });
    if (!Number.isFinite(total) || total <= 0) return NextResponse.json({ error: "Ingresá un monto válido." }, { status: 400 });
    if (purchasedOn && !DATE_RE.test(purchasedOn)) return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });

    const { data, error } = await caller.admin
      .from("organization_purchases")
      .insert({
        organization_id: caller.organizationId,
        supplier: String(body.supplier ?? "").trim().slice(0, 120) || null,
        description,
        total_minor: total,
        ...(purchasedOn ? { purchased_on: purchasedOn } : {}),
        payment_method: String(body.paymentMethod ?? "").trim().slice(0, 40) || null,
        notes: String(body.notes ?? "").trim().slice(0, 500) || null,
        created_by: caller.userId,
      })
      .select(FIELDS)
      .single();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: MISSING }, { status: 503 });
      console.error("COMPRAS POST:", error);
      return NextResponse.json({ error: "No se pudo guardar la compra." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, purchase: serialize(data) });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE: borra una compra (?id=) -- soft-delete, recuperable desde /admin/papelera.
export async function DELETE(request: NextRequest) {
  try {
    const caller = await resolveOrganizer();
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Compra inválida." }, { status: 400 });

    const { data, error } = await caller.admin
      .from("organization_purchases")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", caller.organizationId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("COMPRAS DELETE:", error);
      return NextResponse.json({ error: "No se pudo borrar." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró la compra." }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
