import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

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

// PATCH: cambiar el precio (y opcionalmente nombre/descripcion/activo) de un
// plan de suscripcion existente. No cambia lo que ya se cobro: cada
// organizacion paga el precio nuevo recien en su proxima renovacion
// (cp_prepare_checkout crea una solicitud nueva cuando el precio cambio).
export async function PATCH(request: NextRequest) {
  try {
    const verification = await verifyAdmin();
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: verification.status });

    const body = await request.json();
    const planId = String(body.planId ?? "").trim();
    if (!planId) return NextResponse.json({ error: "Falta el plan." }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.priceMinor !== undefined) {
      const priceMinor = Number(body.priceMinor);
      // Un plan en $0 no se puede pagar (cp_prepare_checkout lo rechaza
      // como "no disponible"): para dar el servicio gratis esta la cortesia.
      if (!Number.isInteger(priceMinor) || priceMinor <= 0) {
        return NextResponse.json({ error: "El precio tiene que ser mayor a $0. Para dar el servicio gratis usá la cuenta de cortesía." }, { status: 400 });
      }
      updates.price_minor = priceMinor;
    }

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: "El nombre no puede estar vacío." }, { status: 400 });
      updates.name = name;
    }

    if (body.description !== undefined) {
      updates.description = body.description ? String(body.description).trim() : null;
    }

    if (body.active !== undefined) {
      updates.active = Boolean(body.active);
    }

    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ error: "Nada para actualizar." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("subscription_plans")
      .update(updates)
      .eq("id", planId)
      .select("id, code, name, description, price_minor, currency, billing_interval, active")
      .maybeSingle();

    if (error) {
      console.error("ADMIN PLANS PATCH:", error);
      return NextResponse.json({ error: "No se pudo actualizar el plan." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No se encontró el plan." }, { status: 404 });

    return NextResponse.json({ ok: true, plan: data });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
