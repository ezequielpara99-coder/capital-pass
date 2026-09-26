import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = "id, dni, full_name, reason, active, created_at";

function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}

async function resolveOrganizer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No hay una sesión válida.", status: 401 } as const;

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) return { error: "No tenés permisos de organizador.", status: 403 } as const;
  return { admin, organizationId: membership.organization_id as string };
}

// GET: lista las personas restringidas de la organizacion.
export async function GET() {
  try {
    const caller = await resolveOrganizer();
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const { data, error } = await caller.admin
      .from("blacklist_entries")
      .select(FIELDS)
      .eq("organization_id", caller.organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (lista negra)." }, { status: 503 });
      console.error("LISTA NEGRA GET:", error);
      return NextResponse.json({ error: "No se pudo cargar la lista." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, entries: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// POST: agrega a alguien a la lista.
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveOrganizer();
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const body = await request.json();
    const dni = String(body.dni ?? "").trim();
    if (!dni) return NextResponse.json({ error: "Ingresá el DNI." }, { status: 400 });

    const { data, error } = await caller.admin
      .from("blacklist_entries")
      .insert({
        organization_id: caller.organizationId,
        dni: dni.slice(0, 30),
        full_name: String(body.fullName ?? "").trim().slice(0, 200) || null,
        reason: String(body.reason ?? "").trim().slice(0, 2000) || null,
      })
      .select(FIELDS)
      .single();

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (lista negra)." }, { status: 503 });
      console.error("LISTA NEGRA POST:", error);
      return NextResponse.json({ error: "No se pudo agregar." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, entry: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH: edita o activa/desactiva una entrada.
export async function PATCH(request: NextRequest) {
  try {
    const caller = await resolveOrganizer();
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const body = await request.json();
    const id = String(body.id ?? "");
    if (!UUID.test(id)) return NextResponse.json({ error: "Entrada inválida." }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.dni !== undefined) {
      const dni = String(body.dni).trim();
      if (!dni) return NextResponse.json({ error: "Ingresá el DNI." }, { status: 400 });
      updates.dni = dni.slice(0, 30);
    }
    if (body.fullName !== undefined) updates.full_name = String(body.fullName).trim().slice(0, 200) || null;
    if (body.reason !== undefined) updates.reason = String(body.reason).trim().slice(0, 2000) || null;
    if (body.active !== undefined) updates.active = Boolean(body.active);

    const { data, error } = await caller.admin
      .from("blacklist_entries")
      .update(updates)
      .eq("id", id)
      .eq("organization_id", caller.organizationId)
      .select(FIELDS)
      .maybeSingle();

    if (error) {
      console.error("LISTA NEGRA PATCH:", error);
      return NextResponse.json({ error: "No se pudo actualizar." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró la entrada." }, { status: 404 });

    return NextResponse.json({ ok: true, entry: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE: borra una entrada (?id=).
export async function DELETE(request: NextRequest) {
  try {
    const caller = await resolveOrganizer();
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!UUID.test(id)) return NextResponse.json({ error: "Entrada inválida." }, { status: 400 });

    const { error } = await caller.admin.from("blacklist_entries").delete().eq("id", id).eq("organization_id", caller.organizationId);
    if (error) {
      console.error("LISTA NEGRA DELETE:", error);
      return NextResponse.json({ error: "No se pudo borrar." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
