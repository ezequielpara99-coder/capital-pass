import "server-only";
import { createClient } from "../supabase/server";

type VerifyResult =
  | { ok: true; userId: string; organizationId: string }
  | { ok: false; status: number; error: string };

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

  return { ok: true, userId: user.id, organizationId: event.organization_id };
}
