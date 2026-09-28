import "server-only";
import { cookies } from "next/headers";
import { verifySessionToken, CUSTOMER_SESSION_COOKIE } from "./session";

export type MemberSessionStatus = "no_email" | "login" | "mismatch" | "ready";

// Estado de la sesion por email del cliente respecto de UNA membresia:
//   ready    -> ingreso con el email de esta membresia
//   login    -> no ingreso todavia
//   mismatch -> ingreso con otro email
//   no_email -> la membresia no tiene email cargado (no se puede verificar)
// El link firmado del carnet alcanza para VER el carnet; para acciones que
// mueven plata (pagar con saldo) o dan acceso a datos privados (avisos al
// celular) se exige ademas este ingreso.
export async function memberSessionStatus(memberEmail: string | null | undefined): Promise<MemberSessionStatus> {
  if (!memberEmail || !memberEmail.trim()) return "no_email";
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value ?? "";
  const sessionEmail = token ? verifySessionToken(token) : null;
  if (!sessionEmail) return "login";
  return sessionEmail.trim().toLowerCase() === memberEmail.trim().toLowerCase() ? "ready" : "mismatch";
}

export const SESSION_MESSAGES: Record<Exclude<MemberSessionStatus, "ready">, { status: number; error: string }> = {
  login: { status: 401, error: "Ingresá con tu email para pagar con saldo." },
  mismatch: { status: 403, error: "Ingresaste con otro email. Usá el email de tu membresía." },
  no_email: { status: 403, error: "Tu membresía no tiene email cargado. Pedile al boliche que lo cargue para pagar con saldo." },
};
