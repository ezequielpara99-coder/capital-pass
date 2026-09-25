import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import CortesiaToggle from "./cortesia-toggle";
import StockAccessToggle from "./stock-access-toggle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  // Si todavia no se corrio la migracion de cuentas de cortesia, la columna
  // no existe: la pagina sigue andando, sin esa seccion.
  const withCourtesy = await admin
    .from("organizations")
    .select("id, name, contact_email, contact_phone, active, created_at, complimentary, complimentary_note")
    .eq("id", id)
    .maybeSingle();

  const courtesyAvailable = !withCourtesy.error;

  const organization = courtesyAvailable
    ? withCourtesy.data
    : (
        await admin
          .from("organizations")
          .select("id, name, contact_email, contact_phone, active, created_at")
          .eq("id", id)
          .maybeSingle()
      ).data;

  if (!organization) {
    notFound();
  }

  const complimentary = courtesyAvailable
    ? Boolean((organization as { complimentary?: boolean }).complimentary)
    : false;
  const complimentaryNote = courtesyAvailable
    ? ((organization as { complimentary_note?: string | null }).complimentary_note ?? null)
    : null;

  // Tolerante: si todavia no se corrio la migracion de bloqueo de stock, no
  // se muestra el toggle en vez de romper la pagina.
  const stockBlockResult = await admin.from("organizations").select("stock_access_blocked").eq("id", id).maybeSingle();
  const stockBlockAvailable = !stockBlockResult.error;
  const stockAccessBlocked = stockBlockAvailable
    ? Boolean((stockBlockResult.data as { stock_access_blocked?: boolean } | null)?.stock_access_blocked)
    : false;

  const [membersResult, eventsResult, subscriptionResult, signupResult, complaintsResult] =
    await Promise.all([
      admin
        .from("organization_members")
        .select("id, user_id, role, status, created_at")
        .eq("organization_id", id),
      admin
        .from("events")
        .select("id, name, slug, status, city, venue_name, starts_at")
        .eq("organization_id", id)
        .order("starts_at", { ascending: false }),
      admin
        .from("organization_subscriptions")
        .select("status, plan_name, amount_minor, currency, current_period_start, current_period_end, payer_email")
        .eq("organization_id", id)
        // organization_subscriptions no tiene constraint UNIQUE por
        // organization_id -- una recontratacion (nuevo signup tras cancelar,
        // o un cambio de plan) deja una fila nueva sin borrar la vieja. Sin
        // order by, .maybeSingle() directamente fallaba con "multiple rows
        // returned" para esas organizaciones, mostrando "Sin suscripcion ni
        // solicitud registrada" aunque estuvieran pagando activamente.
        // cp_org_has_stock_access ya resuelve esto mismo con
        // order by updated_at desc -- mismo criterio acá.
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("subscription_signups")
        .select("email, first_name, last_name")
        .eq("organization_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("complaints")
        .select("id, subject, message, status, admin_response, created_at")
        .eq("organization_id", id)
        .order("created_at", { ascending: false }),
    ]);

  const members = membersResult.data ?? [];
  const events = eventsResult.data ?? [];
  const subscription = subscriptionResult.data;
  const complaints = complaintsResult.data ?? [];

  const organizerMember = members.find(
    (m) => m.role === "organizer" && m.status === "active"
  );

  let organizerProfile: { first_name: string; last_name: string } | null = null;
  let organizerEmail: string | null = null;

  if (organizerMember) {
    const [{ data: profile }, { data: authUser }] = await Promise.all([
      admin.from("profiles").select("first_name, last_name").eq("id", organizerMember.user_id).maybeSingle(),
      admin.auth.admin.getUserById(organizerMember.user_id),
    ]);
    organizerProfile = profile;
    organizerEmail = authUser?.user?.email ?? null;
  }

  const membersByRole = {
    rrpp: members.filter((m) => m.role === "rrpp" && m.status === "active").length,
    door_seller: members.filter((m) => m.role === "door_seller" && m.status === "active").length,
    controller: members.filter((m) => m.role === "controller" && m.status === "active").length,
  };

  const activeEvents = events.filter((e) => ["upcoming", "active"].includes(e.status)).length;
  const cities = [...new Set(events.map((e) => e.city).filter(Boolean))];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] text-[#f7f3ed]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-[260px] -top-[260px] h-[650px] w-[650px] rounded-full bg-[#ff2a1a]/[0.11] blur-[180px]" />
        <div className="absolute -right-[300px] top-[17%] h-[720px] w-[720px] rounded-full bg-[#ff5a2a]/[0.085] blur-[195px]" />
      </div>

      <section className="relative z-10 mx-auto w-full max-w-[1200px] px-5 py-8 md:px-8 xl:px-10">
        <Link
          href="/admin/organizaciones"
          className="inline-flex h-10 items-center border border-white/[0.10] bg-white/[0.025] px-4 text-[9px] font-black uppercase tracking-[0.15em] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white"
        >
          ← Organizaciones
        </Link>

        <p className="mt-7 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff7354]">
          Capital Pass admin
        </p>
        <h1 className="mt-3 text-[clamp(36px,5vw,64px)] font-black uppercase leading-[0.88] tracking-[-0.055em]">
          {organization.name}
        </h1>
        <p className="mt-3 text-sm text-white/40">
          {organization.contact_email ?? "Sin email de contacto"}
          {organization.contact_phone ? ` · ${organization.contact_phone}` : ""}
        </p>

        {/* ORGANIZADOR */}
        <section className="mt-8 border border-white/[0.08] bg-[#090807]/92 p-6">
          <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#ff7958]">
            Organizador
          </p>
          <h2 className="mt-2 text-xl font-black uppercase tracking-[-0.03em]">
            {organizerProfile
              ? `${organizerProfile.first_name} ${organizerProfile.last_name}`.trim()
              : "Sin organizador activo"}
          </h2>
          <p className="mt-2 text-sm text-white/40">
            {organizerEmail ?? "—"}
          </p>
          <p className="mt-1 text-xs text-white/25">
            {cities.length > 0 ? `Ciudades donde opera: ${cities.join(", ")}` : "Sin eventos registrados todavía"}
          </p>
        </section>

        {/* MÉTRICAS */}
        <section className="mt-5 grid gap-[1px] overflow-hidden border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Eventos activos" value={String(activeEvents)} detail={`${events.length} en total`} accent />
          <Metric label="RRPPs" value={String(membersByRole.rrpp)} detail="activos" />
          <Metric label="Puerta" value={String(membersByRole.door_seller)} detail="vendedores activos" />
          <Metric label="Controladores" value={String(membersByRole.controller)} detail="activos" />
        </section>

        {/* SUSCRIPCIÓN */}
        <section className="mt-5 border border-white/[0.08] bg-[#090807]/92 p-6">
          <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#ff7958]">
            Suscripción
          </p>
          {subscription ? (
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <DataBlock label="Estado" value={subscription.status} />
              <DataBlock label="Plan" value={subscription.plan_name ?? "Capital Pass"} />
              <DataBlock label="Monto" value={formatMoney(Number(subscription.amount_minor ?? 0))} />
              <DataBlock label="Vence" value={formatDate(subscription.current_period_end)} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-white/40">
              {signupResult.data
                ? `Todavía sin pago aprobado (solicitud de ${signupResult.data.first_name} ${signupResult.data.last_name} · ${signupResult.data.email}).`
                : "Sin suscripción ni solicitud registrada."}
            </p>
          )}

          {courtesyAvailable && (
            <CortesiaToggle
              organizationId={organization.id}
              initialComplimentary={complimentary}
              initialNote={complimentaryNote}
            />
          )}

          {stockBlockAvailable && (
            <StockAccessToggle organizationId={organization.id} initialBlocked={stockAccessBlocked} />
          )}
        </section>

        {/* EVENTOS */}
        <section className="mt-5 border border-white/[0.08] bg-[#090807]/92">
          <div className="border-b border-white/[0.07] px-6 py-5">
            <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#ff7958]">
              Eventos
            </p>
            <h2 className="mt-2 text-lg font-black uppercase tracking-[-0.03em]">
              {events.length} en total
            </h2>
          </div>

          {events.length === 0 ? (
            <div className="p-6 text-sm text-white/35">Todavía no creó eventos.</div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {events.map((event) => (
                <div key={event.id} className="grid gap-3 px-6 py-4 sm:grid-cols-[1.4fr_.8fr_.8fr_.8fr] sm:items-center">
                  <p className="truncate text-sm font-black text-white/80">{event.name}</p>
                  <DataBlock label="Ciudad" value={event.city ?? "—"} />
                  <DataBlock label="Estado" value={event.status} />
                  <DataBlock label="Fecha" value={formatDate(event.starts_at)} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* RECLAMOS */}
        <section className="mt-5 border border-white/[0.08] bg-[#090807]/92">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-5">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#ff7958]">Reclamos</p>
              <h2 className="mt-2 text-lg font-black uppercase tracking-[-0.03em]">{complaints.length} en total</h2>
            </div>
            <Link href="/admin/reclamos" className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40 hover:text-white">
              Ver todos →
            </Link>
          </div>

          {complaints.length === 0 ? (
            <div className="p-6 text-sm text-white/35">Nunca envió un reclamo.</div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {complaints.map((c) => (
                <div key={c.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black text-white/80">{c.subject}</p>
                    <span className={`text-[9px] font-black uppercase ${c.status === "resuelto" ? "text-emerald-300" : "text-amber-300"}`}>{c.status}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-white/40">{c.message}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <article className={`min-h-[130px] p-5 ${accent ? "bg-[#100806]" : "bg-[#090807]"}`}>
      <p className="text-[8px] font-black uppercase tracking-[0.18em] text-white/27">{label}</p>
      <p className="mt-6 text-[28px] font-black tracking-[-0.05em] text-[#fff4ee]">{value}</p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-white/22">{detail}</p>
    </article>
  );
}

function DataBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/22">{label}</p>
      <p className="mt-2 truncate text-sm font-black text-white/68">{value}</p>
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
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));
}
