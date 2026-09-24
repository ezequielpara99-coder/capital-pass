import "server-only";
import { createClient } from "../supabase/server";

type VerifyResult =
  | { ok: true; userId: string; memberId: string }
  | { ok: false; status: number; error: string };

// Confirma que hay una sesion activa y que ese usuario es controlador
// activo asignado a ese evento puntual. Extraido de
// app/api/control/validar-qr/route.ts para reusarlo tambien en
// /api/control/preload (precarga del modo offline).
export async function verifyControllerForEvent(eventId: string): Promise<VerifyResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, status: 401, error: "No hay una sesión válida." };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "controller")
    .eq("status", "active");

  if (membershipError) {
    console.error("ERROR MEMBERSHIP CONTROL:", membershipError);
    return { ok: false, status: 500, error: "No se pudo verificar el acceso del controlador." };
  }

  const memberIds = memberships?.map((item) => item.id) ?? [];

  if (memberIds.length === 0) {
    return { ok: false, status: 403, error: "Tu cuenta no tiene permisos de control." };
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("event_staff")
    .select("organization_member_id")
    .eq("event_id", eventId)
    .in("organization_member_id", memberIds)
    .eq("staff_role", "controller")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (assignmentError) {
    console.error("ERROR ASSIGNMENT CONTROL:", assignmentError);
    return { ok: false, status: 500, error: "No se pudo verificar la asignación al evento." };
  }

  if (!assignment) {
    return { ok: false, status: 403, error: "No estás autorizado para controlar este evento." };
  }

  return { ok: true, userId: user.id, memberId: assignment.organization_member_id };
}
