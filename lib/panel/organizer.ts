import "server-only";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";

export function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Organizador activo -> su organizationId. Con requirePremium tambien exige
// que Capital Pass le haya habilitado la membresia premium (el panel de
// carta, pedidos y metricas se desbloquea recien despues del pago).
export async function resolveOrganizer(options: { requirePremium?: boolean } = {}) {
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
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) return { error: "No tenés permisos de organizador.", status: 403 } as const;

  if (options.requirePremium) {
    const { data: org, error: orgError } = await admin.from("organizations").select("premium_memberships_enabled").eq("id", membership.organization_id).maybeSingle();
    if (orgError) {
      if (isMissingTable(orgError)) return { error: "Falta aplicar la actualización de la base de datos (membresía premium).", status: 503 } as const;
      return { error: "No se pudo verificar la organización.", status: 500 } as const;
    }
    if (!org?.premium_memberships_enabled) return { error: "La membresía premium no está habilitada para tu cuenta. Contactá a Capital Pass.", status: 403 } as const;
  }

  return { admin, organizationId: membership.organization_id as string, userId: user.id };
}
