import { redirect } from "next/navigation";

import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { pickSelectedEvent } from "../../../../lib/panel/selected-event";

import TrasladosClient, { type RrppOption, type TransferRoute } from "./traslados-client";

export default async function TrasladosPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const { eventId: requestedEventId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("organization_members")
    .select("id, organization_id")
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  const { data: events } = await admin
    .from("events")
    .select("id, name, starts_at")
    .eq("organization_id", membership.organization_id)
    .order("starts_at", { ascending: false })
    .order("created_at", { ascending: false });

  const event = await pickSelectedEvent(events ?? [], requestedEventId);

  if (!event) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-center text-[#f7f3ed]">
        <p className="text-sm text-white/40">No tenés ningún evento todavía.</p>
      </main>
    );
  }

  // RRPPs activos de ESTE evento -- son los unicos a los que tiene sentido
  // asignarles un colectivo (si no estan trabajando el evento, no venden
  // entradas para sumarle pasajeros).
  const { data: staffRows } = await admin
    .from("event_staff")
    .select("organization_member_id")
    .eq("event_id", event.id)
    .eq("staff_role", "rrpp")
    .eq("active", true);

  const memberIds = (staffRows ?? []).map((s) => s.organization_member_id);

  let rrpps: RrppOption[] = [];
  if (memberIds.length > 0) {
    const { data: members } = await admin.from("organization_members").select("id, user_id").in("id", memberIds);
    const userIds = (members ?? []).map((m) => m.user_id);
    const { data: profiles } = userIds.length
      ? await admin.from("profiles").select("id, first_name, last_name").in("id", userIds)
      : { data: [] };
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    rrpps = (members ?? [])
      .map((m) => {
        const profile = profileMap.get(m.user_id);
        const name = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
        return { id: m.id, name: name || "RRPP" };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const { data: routesData, error: routesError } = await admin
    .from("transfer_routes")
    .select("id, event_id, organization_member_id, name, departure_at, departure_location, capacity, is_paid, price_minor, active, created_at")
    .eq("event_id", event.id)
    .order("created_at", { ascending: true });

  const missingSql = Boolean(routesError && (routesError.code === "42P01" || routesError.code === "PGRST205" || /does not exist|schema cache/i.test(routesError.message ?? "")));

  const routes: TransferRoute[] = (routesData ?? []).map((r) => ({
    ...r,
    capacity: r.capacity === null ? null : Number(r.capacity),
    price_minor: Number(r.price_minor),
  }));

  return <TrasladosClient event={{ id: event.id, name: event.name }} rrpps={rrpps} routes={routes} missingSql={missingSql} />;
}
