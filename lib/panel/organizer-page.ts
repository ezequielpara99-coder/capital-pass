import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";

// Guardia comun de las paginas del panel del organizador: sin sesion va a
// /login; sin rol de organizador activo devuelve false (la pagina no muestra nada).
export async function requireOrganizerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  return Boolean(membership);
}
