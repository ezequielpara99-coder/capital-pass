import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { pickSelectedEvent } from "../../../lib/panel/selected-event";

import VenderClient, { type TicketTypeRow, type PackRow } from "./vender-client";

export default async function VenderPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("id, organization_id")
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return null;
  }

  const admin = createAdminClient();

  // Mismo criterio que el resto del panel (pickSelectedEvent: respeta el
  // switcher de evento si el organizador ya eligió uno, si no el más
  // nuevo) -- así esta pantalla sigue el mismo evento que el resto de
  // /panel, en vez de elegir el suyo propio como hacían las pantallas de
  // RRPP/puerta (que sí necesitan un criterio propio porque no tienen
  // switcher).
  const { data: events } = await admin
    .from("events")
    .select("id, name, starts_at")
    .eq("organization_id", membership.organization_id)
    .order("starts_at", { ascending: false })
    .order("created_at", { ascending: false });

  const event = await pickSelectedEvent(events ?? []);

  if (!event) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-center text-[#f7f3ed]">
        <div>
          <p className="text-sm text-white/40">
            No tenés ningún evento todavía.
          </p>
          <Link
            href="/panel/eventos/nuevo"
            className="mt-4 inline-flex h-11 items-center justify-center border border-white/15 px-5 text-[10px] font-black uppercase tracking-[0.14em] text-white/70 hover:text-white"
          >
            Crear evento
          </Link>
        </div>
      </main>
    );
  }

  const { data: ticketTypesData } = await admin
    .from("ticket_types")
    .select("id, name, description, price_minor, currency, capacity, status, active")
    .eq("event_id", event.id)
    .eq("active", true)
    .eq("status", "available")
    .order("created_at", { ascending: true });

  // price_minor es bigint: PostgREST lo devuelve como string, no number.
  const ticketTypes = (ticketTypesData ?? []).map((t) => ({
    ...t,
    price_minor: Number(t.price_minor),
  })) as TicketTypeRow[];

  const { data: packsData } = await admin
    .from("ticket_packs")
    .select("id, name, ticket_type_id, quantity_per_pack, price_minor, active")
    .eq("event_id", event.id)
    .eq("active", true);

  const packs = (packsData ?? []).map((p) => ({
    ...p,
    price_minor: Number(p.price_minor),
  })) as PackRow[];

  return (
    <VenderClient
      event={{ id: event.id, name: event.name }}
      ticketTypes={ticketTypes}
      packs={packs}
    />
  );
}
