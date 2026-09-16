import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { createAdminClient } from "../../lib/supabase/admin";
import { accountFor } from "../../lib/billing/server";
import AccountPanel from "./account-panel";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ retorno?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const loaded = await (async () => {
    const account = await accountFor(user);
    const { data: plans, error } = await createAdminClient().from("subscription_plans")
      .select("id, name, price_minor, currency, billing_interval").eq("active", true).order("price_minor");
    if (error) throw new Error("No se pudieron consultar los planes.");
    return { account, plans: plans ?? [] };
  })().catch(() => null);
  if (!loaded) {
    return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] px-5 py-12 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-320px] h-[680px] w-[900px] -translate-x-1/2 rounded-full bg-[#ff2a1a]/[0.09] blur-[190px]" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[520px] border border-white/[0.09] bg-[#080706]/90 p-8 text-center shadow-[0_30px_120px_rgba(0,0,0,.35)] backdrop-blur-2xl sm:p-9">
        <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#f7f3ed]/35">Tu cuenta</p>
        <h1 className="mt-4 text-2xl font-black uppercase tracking-[-0.03em]">No pudimos consultar tu acceso</h1>
        <p role="alert" className="mt-4 text-sm leading-6 text-white/55">Tu sesión sigue abierta. Reintentá en unos instantes o contactá a soporte.</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/cuenta" className="flex h-12 items-center justify-center border border-white/20 px-6 text-[10px] font-black uppercase tracking-[0.2em] transition hover:border-white/40">Reintentar</Link>
          <Link href="/logout" className="flex h-12 items-center justify-center text-[10px] font-black uppercase tracking-[0.2em] text-white/50 underline transition hover:text-white">Cerrar sesión</Link>
        </div>
      </div>
    </main>;
  }
  const { account, plans } = loaded;
  return <AccountPanel initial={{
    active: account.active, destination: account.destination, organizationName: account.organizationName,
    canManage: Boolean(account.organizationId), isAdmin: account.isAdmin, email: account.email,
    hasSignup: Boolean(account.signup), mpStatus: account.signup?.mp_status ?? null,
    periodEnd: account.periodEnd,
  }} plans={plans} returning={params.retorno === "mercadopago"} />;
}
