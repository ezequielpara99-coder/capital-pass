import "server-only";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";

type VerifyResult =
  | { ok: true; userId: string; organizationId: string }
  | { ok: false; status: number; error: string };

const STOCK_TRIAL_EXPIRED_ERROR =
  "Tu prueba gratuita de 7 días del módulo de stock terminó. Actualizá a Gestión avanzada para seguir usándolo.";

async function hasStockAccess(organizationId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("cp_org_has_stock_access", { p_organization_id: organizationId });
  if (error) {
    console.error("cp_org_has_stock_access:", error);
    return false;
  }
  return Boolean(data);
}

const FALLBACK_ADMIN_EMAILS = ["ezequiel.para99@gmail.com"];

// Confirma que hay una sesion activa y que ese usuario es organizador
// activo del evento indicado. Mismo patron que ya usan las rutas de
// vendedores-puerta/controladores, factorizado porque el modulo de stock
// tiene varias rutas chicas que lo necesitan.
export async function verifyOrganizerForEvent(eventId: string): Promise<VerifyResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "No hay una sesión válida." };
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, organization_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    return { ok: false, status: 404, error: "No se encontró el evento." };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", event.organization_id)
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return { ok: false, status: 403, error: "No tenés permiso para administrar este evento." };
  }

  if (!(await hasStockAccess(event.organization_id))) {
    return { ok: false, status: 402, error: STOCK_TRIAL_EXPIRED_ERROR };
  }

  return { ok: true, userId: user.id, organizationId: event.organization_id };
}

// Confirma que el usuario puede administrar un producto del catalogo:
// admin de la plataforma (para el catalogo global, organization_id null)
// u organizador activo de la organizacion dueña del producto.
export async function verifyProductAccess(productId: string): Promise<VerifyResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "No hay una sesión válida." };
  }

  const admin = createAdminClient();

  const { data: product } = await admin
    .from("products")
    .select("id, organization_id")
    .eq("id", productId)
    .maybeSingle();

  if (!product) {
    return { ok: false, status: 404, error: "No se encontró el producto." };
  }

  if (!product.organization_id) {
    const { data: adminAccess } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const isFallbackAdmin = Boolean(user.email && FALLBACK_ADMIN_EMAILS.includes(user.email.toLowerCase()));

    if (!adminAccess && !isFallbackAdmin) {
      return { ok: false, status: 403, error: "Este producto es del catálogo global de Capital Pass." };
    }

    return { ok: true, userId: user.id, organizationId: "" };
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", product.organization_id)
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return { ok: false, status: 403, error: "No tenés permiso para editar este producto." };
  }

  if (!(await hasStockAccess(product.organization_id))) {
    return { ok: false, status: 402, error: STOCK_TRIAL_EXPIRED_ERROR };
  }

  return { ok: true, userId: user.id, organizationId: product.organization_id };
}
