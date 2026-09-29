import "server-only";
import { createClient } from "../supabase/server";
import { isPlatformAdmin } from "../stock/auth";

type VerifyResult =
  | { ok: true; userId: string; memberId: string | null }
  | { ok: false; status: number; error: string };

// Confirma que hay una sesion activa y que ese usuario puede controlar
// ingresos en ese evento puntual: admin de plataforma, organizador de la
// organizacion dueña del evento, o controlador asignado -- el mismo
// criterio de permiso que ya usa validate_ticket_manual (RPC) para el
// codigo manual. Antes esta funcion (usada por el escaneo de QR por
// camara y por la precarga offline) exigia SOLO role='controller', asi
// que un organizador/admin podia validar por codigo tipeado pero recibia
// 403 al intentar usar la camara o precargar el modo sin señal para su
// propio evento.
export async function verifyControllerForEvent(eventId: string): Promise<VerifyResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, status: 401, error: "No hay una sesión válida." };
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, organization_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    console.error("ERROR EVENT CONTROL:", eventError);
    return { ok: false, status: 500, error: "No se pudo verificar el evento." };
  }
  if (!event) {
    return { ok: false, status: 404, error: "El evento no existe." };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("id, role")
    .eq("organization_id", event.organization_id)
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipError) {
    console.error("ERROR MEMBERSHIP CONTROL:", membershipError);
    return { ok: false, status: 500, error: "No se pudo verificar el acceso del controlador." };
  }

  if (await isPlatformAdmin(user.id, user.email)) {
    return { ok: true, userId: user.id, memberId: null };
  }

  const organizerMembership = (memberships ?? []).find((m) => m.role === "organizer");
  if (organizerMembership) {
    return { ok: true, userId: user.id, memberId: organizerMembership.id };
  }

  const controllerMemberIds = (memberships ?? []).filter((m) => m.role === "controller").map((m) => m.id);
  if (controllerMemberIds.length === 0) {
    return { ok: false, status: 403, error: "Tu cuenta no tiene permisos de control." };
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("event_staff")
    .select("organization_member_id")
    .eq("event_id", eventId)
    .in("organization_member_id", controllerMemberIds)
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
