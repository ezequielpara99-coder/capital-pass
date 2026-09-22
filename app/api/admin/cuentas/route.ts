import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { getAppBaseUrl } from "../../../../lib/mercadopago/server";

const FALLBACK_ADMIN_EMAILS = ["ezequiel.para99@gmail.com"];

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "No hay una sesión válida." };

  const admin = createAdminClient();
  const { data: adminAccess } = await admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  const isFallbackAdmin = Boolean(user.email && FALLBACK_ADMIN_EMAILS.includes(user.email.toLowerCase()));

  if (!adminAccess && !isFallbackAdmin) return { ok: false as const, status: 403, error: "No tenés permiso." };
  return { ok: true as const };
}

// Sin caracteres que se confundan (0/O, 1/l/I) para pasarla por WhatsApp.
function generatePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";
  for (let i = 0; i < 10; i++) value += alphabet[randomInt(alphabet.length)];
  return value;
}

// POST: crea un organizador nuevo (usuario + organizacion) ya confirmado y con
// el servicio activo de cortesia -- pack completo, sin pagar.
export async function POST(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const organizationName = String(body.organizationName ?? "").trim();
    const note = String(body.note ?? "").trim() || null;
    const password = String(body.password ?? "").trim() || generatePassword();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Ingresá un email válido." }, { status: 400 });
    if (!firstName) return NextResponse.json({ error: "Ingresá el nombre." }, { status: 400 });
    if (!organizationName) return NextResponse.json({ error: "Ingresá el nombre de la organización." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "La contraseña tiene que tener al menos 8 caracteres." }, { status: 400 });

    const admin = createAdminClient();

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, organization_name: organizationName },
    });

    if (createError || !created.user) {
      const alreadyExists = /already|registered|exists/i.test(createError?.message ?? "");
      if (!alreadyExists) console.error("ADMIN CUENTAS createUser:", createError);
      return NextResponse.json(
        { error: alreadyExists ? "Ya existe una cuenta con ese email." : "No se pudo crear el usuario." },
        { status: alreadyExists ? 409 : 500 }
      );
    }

    const userId = created.user.id;

    const ensured = await admin.rpc("cp_ensure_account", { p_user_id: userId });
    if (ensured.error || !ensured.data) {
      console.error("ADMIN CUENTAS cp_ensure_account:", ensured.error);
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: "No se pudo preparar la organización." }, { status: 500 });
    }

    const organizationId = ensured.data as string;

    const { error: updateError } = await admin
      .from("organizations")
      .update({ complimentary: true, complimentary_note: note, name: organizationName })
      .eq("id", organizationId);

    if (updateError) {
      console.error("ADMIN CUENTAS marcar cortesia:", updateError);
      return NextResponse.json({ error: "La cuenta se creó pero no se pudo activar la cortesía. Activala desde la organización." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      organizationId,
      email,
      password,
      loginUrl: `${getAppBaseUrl()}/login`,
    });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH: activa o quita la cortesia de una organizacion existente.
export async function PATCH(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const organizationId = String(body.organizationId ?? "").trim();
    if (!organizationId) return NextResponse.json({ error: "Falta la organización." }, { status: 400 });

    // Cada campo se toca solo si vino en el pedido -- asi el toggle de
    // bloqueo de stock no pisa la cortesia (y viceversa).
    const updates: Record<string, unknown> = {};

    if (body.complimentary !== undefined) {
      const complimentary = Boolean(body.complimentary);
      updates.complimentary = complimentary;
      if (!complimentary) updates.complimentary_note = null;
      else if (body.note !== undefined) updates.complimentary_note = String(body.note).trim() || null;
    }

    if (body.stockBlocked !== undefined) {
      updates.stock_access_blocked = Boolean(body.stockBlocked);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No hay nada para actualizar." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("organizations")
      .update(updates)
      .eq("id", organizationId)
      .select("id, complimentary, complimentary_note")
      .maybeSingle();

    if (error) {
      if ("stock_access_blocked" in updates && /stock_access_blocked/i.test(error.message ?? "")) {
        return NextResponse.json({ error: "Falta aplicar la actualización de bloqueo de stock (20260939)." }, { status: 503 });
      }
      console.error("ADMIN CUENTAS PATCH:", error);
      return NextResponse.json({ error: "No se pudo actualizar la organización." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró la organización." }, { status: 404 });

    return NextResponse.json({
      ok: true,
      organization: { ...data, stock_access_blocked: "stock_access_blocked" in updates ? updates.stock_access_blocked : undefined },
    });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
