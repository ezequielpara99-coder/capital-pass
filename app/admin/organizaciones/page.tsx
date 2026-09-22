import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import CrearCuenta from "./crear-cuenta";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OrganizationRow = {
  id: string;
  name: string;
  contact_email: string | null;
  active: boolean;
  complimentary: boolean;
  stock_access_blocked?: boolean;
  created_at: string;
};

type SubscriptionRow = {
  organization_id: string | null;
  status: string;
  current_period_end: string | null;
};

type EventRow = {
  organization_id: string;
  status: string;
  city: string | null;
};

type MemberRow = {
  organization_id: string;
  user_id: string;
  role: string;
  status: string;
};

export default async function AdminOrganizationsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = createAdminClient();

  const { data: adminAccess, error: adminAccessError } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const fallbackAdminEmails = ["ezequiel.para99@gmail.com"];
  const isFallbackAdmin = Boolean(
    user.email && fallbackAdminEmails.includes(user.email.toLowerCase())
  );

  if ((adminAccessError || !adminAccess) && !isFallbackAdmin) {
    redirect("/admin");
  }

  const [organizationsResult, subscriptionsResult, eventsResult, membersResult] =
    await Promise.all([
      admin
        .from("organizations")
        .select("id, name, contact_email, active, complimentary, stock_access_blocked, created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      admin
        .from("organization_subscriptions")
        .select("organization_id, status, current_period_end"),
      admin.from("events").select("organization_id, status, city"),
      admin
        .from("organization_members")
        .select("organization_id, user_id, role, status")
        .eq("role", "organizer"),
    ]);

  // Tolerante en capas: si falta la migracion de bloqueo de stock y/o la de
  // cortesia, esas columnas no existen todavia -- la lista se muestra igual,
  // sin esas marcas puntuales.
  let organizations = (organizationsResult.data ?? []) as OrganizationRow[];
  if (organizationsResult.error) {
    const withCourtesy = await admin
      .from("organizations")
      .select("id, name, contact_email, active, complimentary, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (!withCourtesy.error) {
      organizations = (withCourtesy.data ?? []).map((item) => ({ ...item, stock_access_blocked: false }));
    } else {
      const { data: fallback } = await admin
        .from("organizations")
        .select("id, name, contact_email, active, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      organizations = ((fallback ?? []) as Omit<OrganizationRow, "complimentary" | "stock_access_blocked">[]).map((item) => ({
        ...item,
        complimentary: false,
        stock_access_blocked: false,
      }));
    }
  }
  const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionRow[];
  const events = (eventsResult.data ?? []) as EventRow[];
  const members = (membersResult.data ?? []) as MemberRow[];

  const subscriptionByOrg = new Map(
    subscriptions
      .filter((s) => s.organization_id)
      .map((s) => [s.organization_id as string, s])
  );

  const eventsByOrg = new Map<string, EventRow[]>();
  for (const event of events) {
    const list = eventsByOrg.get(event.organization_id) ?? [];
    list.push(event);
    eventsByOrg.set(event.organization_id, list);
  }

  const organizerByOrg = new Map<string, string>();
  for (const member of members) {
    if (member.status === "active" && !organizerByOrg.has(member.organization_id)) {
      organizerByOrg.set(member.organization_id, member.user_id);
    }
  }

  const organizerUserIds = [...new Set(organizerByOrg.values())];
  const profileByUserId = new Map<string, { first_name: string; last_name: string }>();
  if (organizerUserIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", organizerUserIds);
    for (const profile of profiles ?? []) {
      profileByUserId.set(profile.id, { first_name: profile.first_name, last_name: profile.last_name });
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] text-[#f7f3ed]">
      <Ambient />

      <section className="relative z-10 mx-auto w-full max-w-[1480px] px-5 py-8 md:px-8 xl:px-10">
        <header className="flex flex-col justify-between gap-6 border-b border-white/[0.07] pb-8 lg:flex-row lg:items-end">
          <div>
            <Link
              href="/admin"
              className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white"
            >
              ← Admin
            </Link>

            <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">
              Capital Pass admin
            </p>

            <h1 className="mt-3 text-[clamp(44px,6vw,86px)] font-black uppercase leading-[0.84] tracking-[-0.065em]">
              Organizaciones.
            </h1>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <CrearCuenta />

            <div className="border border-[#ff5a2a]/15 bg-[#ff3b24]/[0.05] px-5 py-4">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/28">
                Total
              </p>
              <p className="mt-2 text-3xl font-black text-[#ffc0ad]">
                {organizations.length}
              </p>
            </div>
          </div>
        </header>

        <section className="mt-5 border border-white/[0.08] bg-[#090807]/92">
          {organizations.length === 0 ? (
            <div className="p-5">
              <div className="border border-dashed border-white/[0.10] p-6 text-center text-sm text-white/35">
                Todavía no hay organizaciones cargadas.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {organizations.map((organization, index) => {
                const orgEvents = eventsByOrg.get(organization.id) ?? [];
                const activeEvents = orgEvents.filter((e) =>
                  ["upcoming", "active"].includes(e.status)
                ).length;
                const cities = [...new Set(orgEvents.map((e) => e.city).filter(Boolean))];
                const subscription = subscriptionByOrg.get(organization.id);
                const organizerUserId = organizerByOrg.get(organization.id);
                const organizerProfile = organizerUserId
                  ? profileByUserId.get(organizerUserId)
                  : null;

                return (
                  <Link
                    key={organization.id}
                    href={`/admin/organizaciones/${organization.id}`}
                    className="grid gap-5 px-5 py-5 transition hover:bg-white/[0.015] lg:grid-cols-[1.2fr_.8fr_.7fr_.8fr_.8fr] lg:items-center md:px-6"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-mono text-[8px] text-[#ff6040]/45">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <p className="truncate text-base font-black text-white/82">
                          {organization.name}
                        </p>
                        {organization.stock_access_blocked && (
                          <span className="border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-red-300">
                            🔒 Stock bloqueado
                          </span>
                        )}
                      </div>
                      <p className="mt-2 pl-7 text-xs text-white/30">
                        {organizerProfile
                          ? `${organizerProfile.first_name} ${organizerProfile.last_name}`.trim()
                          : "Sin organizador"}
                      </p>
                    </div>

                    <DataBlock
                      label="Ciudad"
                      value={cities.length > 0 ? cities.join(", ") : "Sin eventos"}
                    />
                    <DataBlock label="Eventos activos" value={String(activeEvents)} />
                    <DataBlock
                      label="Suscripción"
                      value={
                        organization.complimentary
                          ? "Cortesía (gratis)"
                          : subscription?.status ?? "Sin suscripción"
                      }
                    />
                    <DataBlock
                      label="Vence"
                      value={
                        organization.complimentary
                          ? "Sin vencimiento"
                          : formatDate(subscription?.current_period_end ?? null)
                      }
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function Ambient() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -left-[260px] -top-[260px] h-[650px] w-[650px] rounded-full bg-[#ff2a1a]/[0.11] blur-[180px]" />
      <div className="absolute -right-[300px] top-[17%] h-[720px] w-[720px] rounded-full bg-[#ff5a2a]/[0.085] blur-[195px]" />
      <div className="absolute inset-0 opacity-[0.033]">
        <div className="h-full w-full bg-[radial-gradient(circle,white_0.6px,transparent_0.8px)] bg-[size:5px_5px]" />
      </div>
    </div>
  );
}

function DataBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/22">
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-black text-white/68">
        {value}
      </p>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
