import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppBaseUrl } from "../mercadopago/server";

// Datos de acceso que se le muestran al organizador despues de crear a
// alguien del equipo (o de generarle una contraseña nueva), listos para
// mandar por WhatsApp. Ver app/panel/staff-credentials-modal.tsx.
export type StaffCredentials = {
  name: string;
  role: string;
  email: string;
  username: string | null;
  phone: string | null;
  password: string;
  loginUrl: string;
};

export function staffCredentials(input: Omit<StaffCredentials, "loginUrl">): StaffCredentials {
  return { ...input, loginUrl: `${getAppBaseUrl()}/login` };
}

function usernameBase(firstName: string, lastName: string) {
  const clean = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/\s+/)[0]
      ?.replace(/[^a-z0-9]/g, "") ?? "";
  let base = `${clean(firstName)}${clean(lastName)}`.slice(0, 20);
  if (!/^[a-z]/.test(base)) base = `u${base}`;
  if (base.length < 3) base = `${base}equipo`.slice(0, 20);
  return base;
}

// Le asigna un nombre de usuario unico (para ingresar sin el email) si
// todavia no tiene. Best-effort: si la base todavia no tiene la columna
// (falta correr 20261018) devuelve null y la persona sigue entrando con
// email o celular.
export async function ensureStaffUsername(
  admin: SupabaseClient,
  userId: string,
  firstName: string,
  lastName: string
): Promise<string | null> {
  const { data: profile, error } = await admin.from("profiles").select("username").eq("id", userId).maybeSingle();
  if (error) {
    if (!/username/i.test(error.message ?? "")) console.error("USUARIO EQUIPO: no se pudo leer el perfil.", error);
    return null;
  }
  if (profile?.username) return profile.username as string;

  const base = usernameBase(firstName, lastName);
  const candidates = [base, ...Array.from({ length: 30 }, (_, i) => `${base.slice(0, 18)}${i + 2}`)];
  for (const candidate of candidates) {
    const { data, error: updateError } = await admin
      .from("profiles")
      .update({ username: candidate })
      .eq("id", userId)
      .is("username", null)
      .select("username")
      .maybeSingle();
    if (!updateError) {
      if (data?.username) return data.username as string;
      // Otra llamada en paralelo ya le asigno uno.
      const { data: current } = await admin.from("profiles").select("username").eq("id", userId).maybeSingle();
      return (current?.username as string | undefined) ?? null;
    }
    if (updateError.code !== "23505") {
      console.error("USUARIO EQUIPO: no se pudo asignar el usuario.", updateError);
      return null;
    }
  }
  return null;
}
