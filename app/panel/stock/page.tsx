import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { pickSelectedEvent } from "../../../lib/panel/selected-event";
import StockPanelClient from "./stock-panel-client";
import UpgradeScreen from "./upgrade-screen";

export const dynamic = "force-dynamic";

export default async function StockPage({
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

  const fallbackAdminEmails = ["ezequiel.para99@gmail.com"];
  const isFallbackAdmin = Boolean(user.email && fallbackAdminEmails.includes(user.email.toLowerCase()));
  const { data: platformAdmin } = isFallbackAdmin
    ? { data: null }
    : await admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  const isPlatformAdmin = isFallbackAdmin || Boolean(platformAdmin);

  const { data: hasStockAccess, error: stockAccessError } = await admin.rpc("cp_org_has_stock_access", {
    p_organization_id: membership.organization_id,
  });
  if (stockAccessError) {
    console.error("STOCK PAGE cp_org_has_stock_access:", stockAccessError);
  }

  if (!isPlatformAdmin && !hasStockAccess) {
    // Tolerante: si no se corrio la migracion de bloqueo de stock, la
    // columna no existe y esto simplemente no bloquea nada extra.
    const { data: orgBlock } = await admin
      .from("organizations")
      .select("stock_access_blocked")
      .eq("id", membership.organization_id)
      .maybeSingle();
    const blocked = Boolean((orgBlock as { stock_access_blocked?: boolean } | null)?.stock_access_blocked);

    if (blocked) return <UpgradeScreen plan={null} blocked />;

    const { data: avanzadaPlan } = await admin
      .from("subscription_plans")
      .select("id, name, price_minor, currency")
      .eq("code", "gestion_avanzada")
      .eq("active", true)
      .maybeSingle();

    return <UpgradeScreen plan={avanzadaPlan} />;
  }

  const { data: events } = await admin
    .from("events")
    .select("id, name")
    .eq("organization_id", membership.organization_id)
    .order("starts_at", { ascending: false });

  const eventList = events ?? [];
  const currentEventId = (await pickSelectedEvent(eventList, params.eventId))?.id ?? null;

  if (!currentEventId) {
    return (
      <main className="relative min-h-screen bg-black text-white">
        <div className="mx-auto max-w-xl px-5 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Capital Pass · Stock</p>
          <h1 className="mt-4 text-3xl font-black">Todavía no hay eventos</h1>
          <p className="mt-3 text-sm text-white/50">Creá un evento primero para poder cargar su stock.</p>
          <Link href="/panel/eventos" className="mt-7 inline-flex h-12 items-center rounded-xl border border-white/15 px-6 text-sm font-bold">
            Ir a mis eventos
          </Link>
        </div>
      </main>
    );
  }

  return (
    <StockPanelClient
      organizationId={membership.organization_id}
      events={eventList}
      currentEventId={currentEventId}
    />
  );
}
