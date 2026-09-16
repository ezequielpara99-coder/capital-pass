import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import MesasClient from "./mesas-client";

export const dynamic = "force-dynamic";

export default async function RRPPMesasPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "rrpp")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/rrpp");

  const { data: staff } = await supabase
    .from("event_staff")
    .select("event_id")
    .eq("organization_member_id", membership.id)
    .eq("staff_role", "rrpp")
    .eq("active", true);

  const eventIds = (staff ?? []).map((s) => s.event_id);

  let eventName = "";
  let eventId = "";

  if (eventIds.length > 0) {
    const { data: events } = await supabase
      .from("events")
      .select("id, name, starts_at")
      .in("id", eventIds)
      .order("starts_at", { ascending: true });

    const selected = events?.[0];
    if (selected) {
      eventId = selected.id;
      eventName = selected.name;
    }
  }

  return <MesasClient eventId={eventId} eventName={eventName} />;
}
