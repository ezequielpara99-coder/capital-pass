import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";

const FALLBACK_ADMIN_EMAILS = ["ezequiel.para99@gmail.com"];

// Presupuestos es solo para el admin de la plataforma.
export async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "No hay una sesión válida." };

  const admin = createAdminClient();
  const { data: adminAccess } = await admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  const isFallbackAdmin = Boolean(user.email && FALLBACK_ADMIN_EMAILS.includes(user.email.toLowerCase()));

  if (!adminAccess && !isFallbackAdmin) return { ok: false as const, status: 403, error: "No tenés permiso." };
  return { ok: true as const, userId: user.id };
}

// Para las paginas del admin: manda al login o al admin si no corresponde.
export async function requireAdminPage() {
  const verification = await verifyAdmin();
  if (!verification.ok) redirect(verification.status === 401 ? "/login" : "/admin");
  return verification;
}

// Error tipico de PostgREST cuando la tabla todavia no existe (SQL sin correr).
export function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}

export const QUOTE_FIELDS =
  "id, number, kind, status, client_name, client_contact, client_phone, client_email, title, event_name, modality, items, price_mode, package_price_minor, discount_type, discount_value, discount_label, notes, valid_days, rental_inquiry_id, monthly_pack_id, pack_period, created_at, updated_at";
