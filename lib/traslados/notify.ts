import "server-only";
import { createAdminClient } from "../supabase/admin";
import { sendPushToMember } from "../push/server";
import { createMemberPublicPath } from "../members/signature";

type Claim = {
  ticket_id: string;
  kind: "approaching" | "arrived";
  stop_name: string;
  current_stop_name: string;
  passenger_name: string;
  passenger_phone: string | null;
  sale_id: string | null;
  event_id: string;
};

// Saca caracteres que rompen los filtros .or() de PostgREST.
const clean = (value: string) => value.replace(/[,()*%\\]/g, " ").trim();
const digits = (value: string) => value.replace(/\D/g, "");

// Socios premium que corresponden a un pasaje de colectivo: por el email/DNI/
// telefono de quien compro la entrada, o por el telefono cargado en el pasaje.
async function memberIdsForClaim(admin: ReturnType<typeof createAdminClient>, organizationId: string, claim: Claim) {
  const emails = new Set<string>();
  const dnis = new Set<string>();
  const phones = new Set<string>();

  const addPhone = (value: string | null | undefined) => {
    if (!value) return;
    const raw = clean(value);
    if (raw) phones.add(raw);
    const d = digits(value);
    if (d) phones.add(d);
  };

  addPhone(claim.passenger_phone);

  if (claim.sale_id) {
    const { data: sale } = await admin.from("sales").select("buyer_id").eq("id", claim.sale_id).maybeSingle();
    if (sale?.buyer_id) {
      const { data: buyer } = await admin.from("buyers").select("email, dni, phone").eq("id", sale.buyer_id).maybeSingle();
      if (buyer?.email) emails.add(clean(buyer.email).toLowerCase());
      if (buyer?.dni) {
        dnis.add(clean(buyer.dni));
        dnis.add(digits(buyer.dni));
      }
      addPhone(buyer?.phone);
    }
  }

  const filters: string[] = [];
  for (const email of emails) if (email) filters.push(`email.ilike.${email}`);
  const dniList = [...dnis].filter(Boolean);
  if (dniList.length > 0) filters.push(`dni.in.(${dniList.join(",")})`);
  const phoneList = [...phones].filter(Boolean);
  if (phoneList.length > 0) filters.push(`phone.in.(${phoneList.join(",")})`);
  if (filters.length === 0) return [];

  const { data } = await admin
    .from("premium_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("deleted_at", null)
    .or(filters.join(","))
    .limit(5);

  return (data ?? []).map((m) => m.id as string);
}

// Cuando el colectivo cambia de parada: avisa a los pasajeros (socios con la
// app) que estan por esperarlo. El reclamo es atomico en la base (una fila por
// pasaje y tipo de aviso), asi que llamarlo de mas nunca duplica un aviso.
export async function notifyRouteProgress(routeId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("transfer_claim_notifications", { p_route_id: routeId });
  if (error) {
    // Migracion todavia no aplicada: no rompe nada, simplemente no hay avisos.
    if (!/transfer_claim_notifications|schema cache|does not exist/i.test(error.message ?? "")) {
      console.error("AVISOS COLECTIVO:", error.message);
    }
    return { claimed: 0, sent: 0 };
  }

  const claims = (data ?? []) as Claim[];
  if (claims.length === 0) return { claimed: 0, sent: 0 };

  const { data: event } = await admin.from("events").select("organization_id").eq("id", claims[0].event_id).maybeSingle();
  if (!event) return { claimed: claims.length, sent: 0 };

  let sent = 0;
  for (const claim of claims) {
    const memberIds = await memberIdsForClaim(admin, event.organization_id as string, claim);
    for (const memberId of memberIds) {
      await sendPushToMember(memberId, {
        title: claim.kind === "arrived" ? "El colectivo llegó a tu parada" : "El colectivo ya casi llega",
        body:
          claim.kind === "arrived"
            ? `Está en ${claim.stop_name}. Subí con tu código.`
            : `Está en ${claim.current_stop_name} y sigue ${claim.stop_name}, tu parada. Andá yendo.`,
        url: createMemberPublicPath(memberId),
      });
      sent++;
    }
  }

  return { claimed: claims.length, sent };
}
