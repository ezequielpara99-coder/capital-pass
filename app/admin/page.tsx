import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";
import { createAdminClient } from "../../lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OrganizationRow = {
  id: string;
  name: string;
  created_at: string | null;
};

type EventRow = {
  id: string;
  organization_id: string;
  name: string;
  starts_at: string | null;
  status: string;
  city: string | null;
};

type MemberRow = {
  id: string;
  organization_id: string;
  role: string;
  status: string;
  user_id: string;
};

type SaleRow = {
  id: string;
  organization_id: string | null;
  event_id: string | null;
  total_minor: number | string | null;
  status: string;
  created_at: string | null;
};

export default async function AdminPage() {
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
    return (
      <AccessDenied
        missingTable={Boolean(
          adminAccessError?.code === "42P01" ||
            adminAccessError?.message
              ?.toLowerCase()
              .includes("relation")
        )}
        userId={user.id}
        email={user.email ?? null}
        errorMessage={adminAccessError?.message ?? null}
      />
    );
  }

  const [
    organizationsResult,
    eventsResult,
    membersResult,
    salesResult,
  ] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name, created_at")
      .order("created_at", { ascending: false })
      .limit(8),

    admin
      .from("events")
      .select("id, organization_id, name, starts_at, status, city")
      .order("starts_at", { ascending: false })
      .limit(8),

    admin
      .from("organization_members")
      .select("id, organization_id, role, status, user_id")
      .limit(500),

    admin
      .from("sales")
      .select("id, organization_id, event_id, total_minor, status, created_at")
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const organizations =
    (organizationsResult.data ?? []) as OrganizationRow[];

  const events =
    (eventsResult.data ?? []) as EventRow[];

  const members =
    (membersResult.data ?? []) as MemberRow[];

  const sales =
    (salesResult.data ?? []) as SaleRow[];

  const organizationMap = new Map(
    organizations.map((organization) => [
      organization.id,
      organization,
    ])
  );

  const activeOrganizations = organizations.length;

  const activeMembers = members.filter(
    (member) => member.status === "active"
  ).length;

  const organizers = members.filter(
    (member) =>
      member.role === "organizer" &&
      member.status === "active"
  ).length;

  const totalSales = sales.reduce(
    (total, sale) => total + Number(sale.total_minor ?? 0),
    0
  );

  const recentOrganizations = organizations.map((organization) => {
    const orgMembers = members.filter(
      (member) => member.organization_id === organization.id
    );

    const orgEvents = events.filter(
      (event) => event.organization_id === organization.id
    );

    return {
      ...organization,
      membersCount: orgMembers.length,
      organizersCount: orgMembers.filter(
        (member) => member.role === "organizer"
      ).length,
      eventsCount: orgEvents.length,
    };
  });

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] text-[#f7f3ed]">
      <Ambient />

      <section className="relative z-10 mx-auto w-full max-w-[1480px] px-5 py-8 md:px-8 xl:px-10">
        <header className="flex flex-col justify-between gap-6 border-b border-white/[0.07] pb-8 lg:flex-row lg:items-end">
          <div>
            <div className="inline-flex items-center gap-3 border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.055] px-4 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff3b24] shadow-[0_0_12px_#ff3b24]" />
              <span className="text-[9px] font-black uppercase tracking-[0.22em] text-[#ff9272]">
                Capital Pass admin
              </span>
            </div>

            <h1 className="mt-7 text-[clamp(46px,6vw,92px)] font-black uppercase leading-[0.84] tracking-[-0.065em]">
              Panel
              <span className="block bg-gradient-to-r from-[#fff2ea] via-[#ff8c69] to-[#ff2a1a] bg-clip-text text-transparent">
                administrador.
              </span>
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/panel"
              className="inline-flex h-11 items-center justify-center border border-white/[0.10] bg-white/[0.025] px-5 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white"
            >
              Ir al panel
            </Link>

            <Link
              href="/suscribirse"
              className="inline-flex h-11 items-center justify-center bg-[#ff2a1a] px-5 text-[9px] font-black uppercase tracking-[0.15em] text-white transition hover:bg-[#ff4a2d]"
            >
              Ver suscripción
            </Link>
          </div>
        </header>

        <section className="mt-7 grid gap-[1px] overflow-hidden border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            number="01"
            label="Organizaciones"
            value={String(organizations.length)}
            detail={`${activeOrganizations} activas`}
            accent
          />
          <Metric
            number="02"
            label="Eventos"
            value={String(events.length)}
            detail="últimos cargados"
          />
          <Metric
            number="03"
            label="Usuarios"
            value={String(activeMembers)}
            detail={`${organizers} organizadores`}
          />
          <Metric
            number="04"
            label="Ventas"
            value={String(sales.length)}
            detail="confirmadas"
          />
          <Metric
            number="05"
            label="Total vendido"
            value={formatMoney(totalSales)}
            detail="ventas confirmadas"
            accent
          />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
          <PanelCard eyebrow="Accounts" title="Organizaciones recientes">
            {recentOrganizations.length === 0 ? (
              <Empty text="Todavía no hay organizaciones cargadas." />
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {recentOrganizations.map((organization, index) => (
                  <OrganizationRow
                    key={organization.id}
                    organization={organization}
                    index={index}
                  />
                ))}
              </div>
            )}
          </PanelCard>

          <PanelCard eyebrow="Live events" title="Eventos recientes">
            {events.length === 0 ? (
              <Empty text="Todavía no hay eventos cargados." />
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {events.map((event, index) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    organizationName={
                      organizationMap.get(event.organization_id)?.name ??
                      "Organización"
                    }
                    index={index}
                  />
                ))}
              </div>
            )}
          </PanelCard>
        </section>

        <section className="mt-5 border border-white/[0.08] bg-[#080706]/85 p-5 md:p-6">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7958]">
            Operations
          </p>

          <h2 className="mt-2 text-2xl font-black uppercase tracking-[-0.04em]">
            Accesos rápidos
          </h2>

          <div className="mt-6 grid gap-[1px] bg-white/[0.08] sm:grid-cols-2 xl:grid-cols-4">
            <QuickLink number="01" label="Organizaciones" href="/admin/organizaciones" />
            <QuickLink number="02" label="Suscripciones" href="/admin/suscripciones" />
            <QuickLink number="03" label="Panel organizador" href="/panel" />
            <QuickLink number="04" label="Informes" href="/panel/informes" />
          </div>
        </section>
      </section>
    </main>
  );
}

function AccessDenied({
  missingTable,
  userId,
  email,
  errorMessage,
}: {
  missingTable: boolean;
  userId: string;
  email: string | null;
  errorMessage: string | null;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] px-5 text-[#f7f3ed]">
      <Ambient />

      <section className="relative z-10 w-full max-w-xl border border-[#ff5a2a]/20 bg-[#0a0807] p-7">
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">
          Capital Pass admin
        </p>

        <h1 className="mt-4 text-3xl font-black uppercase tracking-[-0.04em]">
          Acceso no habilitado
        </h1>

        <p className="mt-4 text-sm leading-6 text-white/45">
          Tu usuario inició sesión, pero todavía no está registrado como
          administrador de plataforma.
        </p>

        <div className="mt-5 border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.06] p-4">
          <p className="text-xs leading-5 text-[#ffc0ad]">
            {missingTable
              ? "Falta crear la tabla platform_admins o habilitar tu usuario dentro de esa tabla."
              : "El usuario actual no coincide con un administrador habilitado."}
          </p>
          <div className="mt-3 space-y-1 text-[11px] leading-5 text-white/40">
            <p>User ID: {userId}</p>
            <p>Email: {email ?? "sin email"}</p>
            {errorMessage && <p>Error: {errorMessage}</p>}
          </div>
        </div>

        <Link
          href="/panel"
          className="mt-6 inline-flex h-11 items-center justify-center bg-[#ff2a1a] px-5 text-[9px] font-black uppercase tracking-[0.15em] text-white"
        >
          Volver al panel
        </Link>
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

function Metric({
  number,
  label,
  value,
  detail,
  accent = false,
}: {
  number: string;
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <article className={`relative min-h-[160px] overflow-hidden p-5 ${accent ? "bg-[#100806]" : "bg-[#090807]"}`}>
      <div className="flex items-center justify-between">
        <p className="text-[8px] font-black uppercase tracking-[0.18em] text-white/27">
          {label}
        </p>
        <span className="font-mono text-[8px] text-[#ff6040]/45">
          {number}
        </span>
      </div>

      <p className="mt-8 text-[32px] font-black tracking-[-0.055em] text-[#fff4ee]">
        {value}
      </p>

      <p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-white/22">
        {detail}
      </p>
    </article>
  );
}

function PanelCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-white/[0.08] bg-[#090807]/92">
      <div className="border-b border-white/[0.07] px-5 py-5 md:px-6">
        <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#ff7958]">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-black uppercase tracking-[-0.035em]">
          {title}
        </h2>
      </div>

      {children}
    </div>
  );
}

function OrganizationRow({
  organization,
  index,
}: {
  organization: OrganizationRow & {
    membersCount: number;
    organizersCount: number;
    eventsCount: number;
  };
  index: number;
}) {
  return (
    <article className="grid gap-4 px-5 py-4 transition hover:bg-white/[0.015] md:grid-cols-[1fr_auto] md:items-center md:px-6">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[8px] text-[#ff6040]/45">
            {String(index + 1).padStart(2, "0")}
          </span>
          <p className="truncate text-sm font-black text-white/75">
            {organization.name}
          </p>
        </div>

        <p className="mt-2 pl-7 text-xs text-white/30">
          {organization.eventsCount} eventos · {organization.membersCount} usuarios ·{" "}
          {organization.organizersCount} organizador
          {organization.organizersCount === 1 ? "" : "es"}
        </p>
      </div>

      <p className="text-xs text-white/30">
        {formatDate(organization.created_at)}
      </p>
    </article>
  );
}

function EventRow({
  event,
  organizationName,
  index,
}: {
  event: EventRow;
  organizationName: string;
  index: number;
}) {
  return (
    <article className="grid gap-4 px-5 py-4 transition hover:bg-white/[0.015] md:grid-cols-[1fr_auto] md:items-center md:px-6">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[8px] text-[#ff6040]/45">
            {String(index + 1).padStart(2, "0")}
          </span>
          <p className="truncate text-sm font-black text-white/75">
            {event.name}
          </p>
        </div>

        <p className="mt-2 pl-7 text-xs text-white/30">
          {organizationName}
          {event.city ? ` · ${event.city}` : ""}
        </p>
      </div>

      <div className="text-left md:text-right">
        <p className="text-xs text-white/40">
          {formatDate(event.starts_at)}
        </p>
        <p className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#ff7958]">
          {event.status}
        </p>
      </div>
    </article>
  );
}

function QuickLink({
  number,
  label,
  href,
}: {
  number: string;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-[72px] items-center justify-between bg-[#090807] px-4 transition hover:bg-[#100806]"
    >
      <div className="flex items-center gap-4">
        <span className="font-mono text-[8px] text-[#ff6040]/45">
          {number}
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.10em] text-white/55 transition group-hover:text-white">
          {label}
        </span>
      </div>
      <span className="text-[#ff6040] transition group-hover:translate-x-1">
        →
      </span>
    </Link>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="p-5">
      <div className="border border-dashed border-white/[0.10] p-6 text-center text-sm text-white/35">
        {text}
      </div>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
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
