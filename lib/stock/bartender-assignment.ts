import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pickCurrentEvent } from "../events/current-event";

// Barra y evento que le toca a un bartender ahora. Si esta asignado a varios
// eventos, gana el que esta en curso o el proximo (lib/events/current-event.ts)
// -- antes se tomaba la asignacion mas reciente, que podia ser la de un
// evento futuro. La usan /api/stock/bartender-context y /api/stock/combo/lookup:
// tienen que devolver SIEMPRE la misma barra en la misma sesion.
export async function currentBartenderAssignment(admin: SupabaseClient, memberId: string) {
  const { data: rows } = await admin
    .from("event_staff")
    .select("event_id, bar_id")
    .eq("organization_member_id", memberId)
    .eq("staff_role", "bartender")
    .eq("active", true);

  const withBar = (rows ?? []).filter((row) => row.bar_id) as { event_id: string; bar_id: string }[];
  if (withBar.length === 0) return null;

  const { data: events } = await admin
    .from("events")
    .select("id, name, starts_at, status")
    .in("id", [...new Set(withBar.map((row) => row.event_id))]);

  const picked = pickCurrentEvent((events ?? []) as { id: string; name: string; starts_at: string | null; status: string | null }[]);
  if (!picked) return null;
  return withBar.find((row) => row.event_id === picked.id) ?? null;
}
