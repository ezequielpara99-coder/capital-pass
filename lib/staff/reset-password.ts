import "server-only";
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const STAFF_ROLES = ["rrpp", "controller", "door_seller", "bartender"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// Sin caracteres que se confundan (0/O, 1/l/I) para pasarla por WhatsApp --
// mismo alfabeto que usa /api/admin/cuentas.
export function generateStaffPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";
  for (let i = 0; i < 10; i++) value += alphabet[randomInt(alphabet.length)];
  return value;
}

type MemberRow = { id: string; organization_id: string; user_id: string; role: string };

// Busca la membresia de equipo (rrpp/controlador/puerta/bartender). Nunca
// devuelve organizadores: este flujo solo sirve para cuentas de equipo.
export async function findStaffMember(admin: SupabaseClient, memberId: string): Promise<MemberRow | null> {
  const { data } = await admin
    .from("organization_members")
    .select("id, organization_id, user_id, role")
    .eq("id", memberId)
    .maybeSingle();
  if (!data || !(STAFF_ROLES as readonly string[]).includes(data.role)) return null;
  return data as MemberRow;
}

type ResetResult =
  | { ok: true; email: string; password: string; phone: string | null; firstName: string; lastName: string; role: StaffRole }
  | { ok: false; status: number; error: string };

// Le pone una contraseña nueva a la cuenta de un miembro del equipo. La
// contraseña vieja no se puede "reenviar" (Supabase solo guarda el hash), asi
// que siempre se genera una nueva.
//
// Freno de seguridad: si esa misma cuenta es organizadora en cualquier
// organizacion, o admin de la plataforma, se rechaza. Si no, un organizador
// podia tomar la cuenta de otro organizador (o la del admin) solo con que esa
// persona figurara tambien como RRPP/controlador en su organizacion. Por el
// mismo motivo, si la cuenta es parte del equipo de OTRA organizacion, el
// organizador no la puede tocar (solo el admin).
export async function resetStaffPassword(
  admin: SupabaseClient,
  member: MemberRow,
  options: { allowOtherOrganizations: boolean }
): Promise<ResetResult> {
  const [{ data: memberships }, { data: platformAdmin }] = await Promise.all([
    admin.from("organization_members").select("organization_id, role").eq("user_id", member.user_id),
    admin.from("platform_admins").select("user_id").eq("user_id", member.user_id).maybeSingle(),
  ]);

  if (platformAdmin || (memberships ?? []).some((m) => m.role === "organizer")) {
    return { ok: false, status: 403, error: "Esta cuenta también es de un organizador. No se le puede cambiar la contraseña desde acá." };
  }

  if (!options.allowOtherOrganizations && (memberships ?? []).some((m) => m.organization_id !== member.organization_id)) {
    return { ok: false, status: 403, error: "Esta cuenta también trabaja con otra organización. Pedile que use “Olvidé mi contraseña” en el login." };
  }

  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(member.user_id);
  if (authError || !authUser?.user?.email) {
    return { ok: false, status: 404, error: "No se encontró la cuenta de esta persona." };
  }

  const password = generateStaffPassword();
  const { error: updateError } = await admin.auth.admin.updateUserById(member.user_id, { password });
  if (updateError) {
    console.error("RESET PASSWORD EQUIPO:", updateError);
    return { ok: false, status: 500, error: "No se pudo cambiar la contraseña." };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("first_name, last_name, phone")
    .eq("id", member.user_id)
    .maybeSingle();

  // Los RRPP guardan el telefono en user_metadata, el resto en profiles.
  const metadata = (authUser.user.user_metadata ?? {}) as Record<string, unknown>;
  const metadataPhone = typeof metadata.phone === "string" ? metadata.phone : "";

  return {
    ok: true,
    email: authUser.user.email,
    password,
    phone: profile?.phone?.trim() || metadataPhone.trim() || null,
    firstName: profile?.first_name ?? "",
    lastName: profile?.last_name ?? "",
    role: member.role as StaffRole,
  };
}
