import { redirect } from "next/navigation";

import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import CartaClient from "./carta-client";

export const dynamic = "force-dynamic";

export default async function CartaPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("id, organization_id")
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/panel");

  const admin = createAdminClient();

  const [{ data: events }, { data: organization }] = await Promise.all([
    admin.from("events").select("id, name").eq("organization_id", membership.organization_id).order("starts_at", { ascending: false }),
    admin.from("organizations").select("name").eq("id", membership.organization_id).maybeSingle(),
  ]);

  const eventList = events ?? [];
  const currentEventId = params.eventId ?? eventList[0]?.id ?? null;

  if (!currentEventId) redirect("/panel/stock");

  const currentEvent = eventList.find((ev) => ev.id === currentEventId) ?? null;

  return (
    <CartaClient
      eventId={currentEventId}
      eventName={currentEvent?.name ?? "Evento"}
      organizationName={organization?.name ?? "Capital Pass"}
    />
  );
}
