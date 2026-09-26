import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createMemberPublicPath } from "../../../../lib/members/signature";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = "id, first_name, last_name, dni, phone, email, member_code, status, starts_at, expires_at, notes, balance_minor, created_at";

function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}

// Organizador activo -> su organizationId, solo si el addon esta habilitado
// (lo prende un admin de plataforma desde /admin/organizaciones).
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

  const { data: org, error: orgError } = await admin.from("organizations").select("premium_memberships_enabled").eq("id", membership.organization_id).maybeSingle();
  if (orgError) {
    if (isMissingTable(orgError)) return { error: "Falta aplicar la actualización de la base de datos (membresía premium)." , status: 503 } as const;
    return { error: "No se pudo verificar la organización.", status: 500 } as const;
  }
  if (!org?.premium_memberships_enabled) return { error: "La membresía premium no está habilitada para tu cuenta. Contactá a Capital Pass.", status: 403 } as const;

  return { admin, organizationId: membership.organization_id as string };
}

function generateMemberCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let value = "";
  for (let i = 0; i < 6; i++) value += alphabet[Math.floor(Math.random() * alphabet.length)];
  return value;
}

// GET: lista los socios premium de la organizacion.
export async function GET() {
  try {
    const caller = await resolveOrganizer();
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const { data, error } = await caller.admin
      .from("premium_members")
      .select(FIELDS)
      .eq("organization_id", caller.organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (membresía premium)." }, { status: 503 });
      console.error("MEMBRESIA PREMIUM GET:", error);
      return NextResponse.json({ error: "No se pudieron cargar los socios." }, { status: 500 });
    }

    const members = (data ?? []).map((m) => ({ ...m, balance_minor: Number(m.balance_minor), cardUrl: createMemberPublicPath(m.id) }));
    return NextResponse.json({ ok: true, members });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// POST: agrega un socio premium.
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveOrganizer();
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const body = await request.json();
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    if (!firstName || !lastName) return NextResponse.json({ error: "Ingresá nombre y apellido." }, { status: 400 });

    let code = "";
    let attempt = 0;
    let data: Record<string, unknown> | null = null;
    let lastError: { code?: string; message?: string } | null = null;

    // Reintenta con otro codigo si por azar ya existe uno igual en esta
    // organizacion (probabilidad minima, pero el indice unico lo frena).
    while (attempt < 5 && !data) {
      code = generateMemberCode();
      const result = await caller.admin
        .from("premium_members")
        .insert({
          organization_id: caller.organizationId,
          first_name: firstName.slice(0, 120),
          last_name: lastName.slice(0, 120),
          dni: String(body.dni ?? "").trim().slice(0, 30) || null,
          phone: String(body.phone ?? "").trim().slice(0, 60) || null,
          email: String(body.email ?? "").trim().slice(0, 200) || null,
          member_code: code,
          starts_at: body.startsAt || new Date().toISOString().slice(0, 10),
          expires_at: body.expiresAt || null,
          notes: String(body.notes ?? "").trim().slice(0, 2000) || null,
        })
        .select(FIELDS)
        .single();

      if (!result.error) {
        data = result.data;
        break;
      }
      lastError = result.error;
      if (result.error.code !== "23505") break;
      attempt++;
    }

    if (!data) {
      if (isMissingTable(lastError)) return NextResponse.json({ error: "Falta aplicar la actualización de la base de datos (membresía premium)." }, { status: 503 });
      console.error("MEMBRESIA PREMIUM POST:", lastError);
      return NextResponse.json({ error: "No se pudo agregar el socio." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, member: { ...data, balance_minor: Number((data as { balance_minor: number }).balance_minor), cardUrl: createMemberPublicPath((data as { id: string }).id) } });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH: edita un socio o cambia su estado (id en el body).
export async function PATCH(request: NextRequest) {
  try {
    const caller = await resolveOrganizer();
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const body = await request.json();
    const id = String(body.id ?? "");
    if (!UUID.test(id)) return NextResponse.json({ error: "Socio inválido." }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.firstName !== undefined) updates.first_name = String(body.firstName).trim().slice(0, 120) || null;
    if (body.lastName !== undefined) updates.last_name = String(body.lastName).trim().slice(0, 120) || null;
    if (body.dni !== undefined) updates.dni = String(body.dni).trim().slice(0, 30) || null;
    if (body.phone !== undefined) updates.phone = String(body.phone).trim().slice(0, 60) || null;
    if (body.email !== undefined) updates.email = String(body.email).trim().slice(0, 200) || null;
    if (body.expiresAt !== undefined) updates.expires_at = body.expiresAt || null;
    if (body.notes !== undefined) updates.notes = String(body.notes).trim().slice(0, 2000) || null;
    if (body.status !== undefined && ["active", "expired", "cancelled"].includes(body.status)) updates.status = body.status;

    const { data, error } = await caller.admin
      .from("premium_members")
      .update(updates)
      .eq("id", id)
      .eq("organization_id", caller.organizationId)
      .select(FIELDS)
      .maybeSingle();

    if (error) {
      console.error("MEMBRESIA PREMIUM PATCH:", error);
      return NextResponse.json({ error: "No se pudo guardar el socio." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el socio." }, { status: 404 });

    return NextResponse.json({ ok: true, member: { ...data, balance_minor: Number((data as { balance_minor: number }).balance_minor), cardUrl: createMemberPublicPath((data as { id: string }).id) } });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE: borra un socio (?id=).
export async function DELETE(request: NextRequest) {
  try {
    const caller = await resolveOrganizer();
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!UUID.test(id)) return NextResponse.json({ error: "Socio inválido." }, { status: 400 });

    const { error } = await caller.admin.from("premium_members").delete().eq("id", id).eq("organization_id", caller.organizationId);
    if (error) {
      console.error("MEMBRESIA PREMIUM DELETE:", error);
      return NextResponse.json({ error: "No se pudo borrar el socio." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
