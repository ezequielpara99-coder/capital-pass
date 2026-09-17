import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import PlanesClient from "./planes-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OrganizationRow = {
  id: string;
  name: string;
};

type SubscriptionRow = {
  id: string;
  organization_id: string | null;
  status: string;
  plan_name: string | null;
  amount_minor: number | string | null;
  currency: string | null;
  payer_email: string | null;
  mercadopago_preapproval_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string | null;
};

export default async function AdminSubscriptionsPage() {
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

  const [organizationsResult, subscriptionsResult, plansResult] = await Promise.all([
    admin.from("organizations").select("id, name").limit(1000),
    admin
      .from("organization_subscriptions")
      .select(`
        id,
        organization_id,
        status,
        plan_name,
        amount_minor,
        currency,
        payer_email,
        mercadopago_preapproval_id,
        current_period_start,
        current_period_end,
        created_at
      `)
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("subscription_plans")
      .select("id, code, name, description, price_minor, currency, billing_interval, active")
      .order("price_minor", { ascending: true }),
  ]);

  const plans = (plansResult.data ?? []) as {
    id: string;
    code: string;
    name: string;
    description: string | null;
    price_minor: number;
    currency: string;
    billing_interval: string;
    active: boolean;
  }[];

  const organizations =
    (organizationsResult.data ?? []) as OrganizationRow[];

  const organizationMap = new Map(
    organizations.map((organization) => [
      organization.id,
      organization.name,
    ])
  );

  const tableMissing = Boolean(
    subscriptionsResult.error?.code === "42P01" ||
      subscriptionsResult.error?.message
        ?.toLowerCase()
        .includes("organization_subscriptions")
  );

  const subscriptions =
    tableMissing || subscriptionsResult.error
      ? []
      : ((subscriptionsResult.data ?? []) as SubscriptionRow[]);

  const activeSubscriptions = subscriptions.filter(
    (subscription) => subscription.status === "active"
  ).length;

  const pendingSubscriptions = subscriptions.filter((subscription) =>
    ["pending", "authorized", "paused"].includes(subscription.status)
  ).length;

  const totalMonthly = subscriptions
    .filter((subscription) => subscription.status === "active")
    .reduce(
      (total, subscription) =>
        total + Number(subscription.amount_minor ?? 0),
      0
    );

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
              Suscripciones.
            </h1>
          </div>

          <div className="border border-[#ff5a2a]/15 bg-[#ff3b24]/[0.05] px-5 py-4">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/28">
              Activas
            </p>
            <p className="mt-2 text-3xl font-black text-[#ffc0ad]">
              {activeSubscriptions}
            </p>
          </div>
        </header>

        <section className="mt-7 grid gap-[1px] overflow-hidden border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Suscripciones"
            value={String(subscriptions.length)}
            detail="registradas"
          />
          <Metric
            label="Activas"
            value={String(activeSubscriptions)}
            detail="cobrando"
            accent
          />
          <Metric
            label="Pendientes"
            value={String(pendingSubscriptions)}
            detail="a revisar"
          />
          <Metric
            label="Ingreso mensual"
            value={formatMoney(totalMonthly)}
            detail="suscripciones activas"
            accent
          />
        </section>

        {plans.length > 0 && <PlanesClient plans={plans} />}

        <section className="mt-5 border border-white/[0.08] bg-[#090807]/92">
          <div className="border-b border-white/[0.07] px-5 py-5 md:px-6">
            <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#ff7958]">
              Billing
            </p>
            <h2 className="mt-2 text-xl font-black uppercase tracking-[-0.035em]">
              Suscripciones de organizadores
            </h2>
          </div>

          {tableMissing ? (
            <MissingTable />
          ) : subscriptions.length === 0 ? (
            <div className="p-5">
              <div className="border border-dashed border-white/[0.10] p-6 text-center text-sm text-white/35">
                Todavía no hay suscripciones registradas.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {subscriptions.map((subscription, index) => (
                <SubscriptionItem
                  key={subscription.id}
                  subscription={subscription}
                  organizationName={
                    subscription.organization_id
                      ? organizationMap.get(subscription.organization_id) ??
                        "Organización"
                      : "Sin organización"
                  }
                  index={index}
                />
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function MissingTable() {
  return (
    <div className="p-5">
      <div className="border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.06] p-5">
        <p className="text-sm font-black uppercase tracking-[-0.02em] text-[#ffc0ad]">
          Falta crear la tabla de suscripciones
        </p>
        <p className="mt-3 text-sm leading-6 text-white/40">
          Creá <code>organization_subscriptions</code> en Supabase para que el
          admin pueda listar pagos, estado, plan y vencimientos.
        </p>
      </div>
    </div>
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
    <article className={`min-h-[145px] p-5 ${accent ? "bg-[#100806]" : "bg-[#090807]"}`}>
      <p className="text-[8px] font-black uppercase tracking-[0.18em] text-white/27">
        {label}
      </p>
      <p className="mt-7 text-[32px] font-black tracking-[-0.055em] text-[#fff4ee]">
        {value}
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-white/22">
        {detail}
      </p>
    </article>
  );
}

function SubscriptionItem({
  subscription,
  organizationName,
  index,
}: {
  subscription: SubscriptionRow;
  organizationName: string;
  index: number;
}) {
  return (
    <article className="grid gap-5 px-5 py-5 transition hover:bg-white/[0.015] lg:grid-cols-[1.1fr_.75fr_.75fr_.85fr_.8fr] lg:items-center md:px-6">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[8px] text-[#ff6040]/45">
            {String(index + 1).padStart(2, "0")}
          </span>
          <p className="truncate text-base font-black text-white/82">
            {organizationName}
          </p>
        </div>
        <p className="mt-2 pl-7 text-xs text-white/30">
          {subscription.payer_email ?? "Sin email de pago"}
        </p>
      </div>

      <DataBlock label="Plan" value={subscription.plan_name ?? "Capital Pass"} />
      <DataBlock label="Estado" value={subscription.status} />
      <DataBlock
        label="Monto"
        value={formatMoney(Number(subscription.amount_minor ?? 0))}
      />
      <DataBlock
        label="Vence"
        value={formatDate(subscription.current_period_end)}
      />
    </article>
  );
}

function DataBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/22">
        {label}
      </p>
      <p className="mt-2 text-sm font-black text-white/68">
        {value}
      </p>
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
