import "server-only";
import { createClient } from "../supabase/server";

type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string };

// Confirma que hay una sesion activa y que ese usuario es organizador
// activo de la organizacion indicada. Hay que resolver primero la
// organizacion DUEÑA del recurso (evento, venta, entrada, devolucion...) y
// recien despues llamar esto -- buscar la membresia del usuario sin saber
// todavia a que organizacion pertenece el recurso es lo que causaba el bug:
// un organizador que administra mas de una organizacion podia toparse con
// la membresia de la organizacion equivocada (Postgres no garantiza el
// orden de filas sin ORDER BY) y recibir un 403/404 para un recurso que en
// realidad si le pertenece.
export async function verifyOrganizerForOrg(organizationId: string): Promise<VerifyResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "No hay una sesión válida." };
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return { ok: false, status: 403, error: "No tenés permisos de organizador." };
  }

  return { ok: true, userId: user.id };
}
