import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";

async function updateFee(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/panel/cobros");

  const fee = Number(formData.get("fee"));
  if (!Number.isFinite(fee) || fee < 0 || fee >= 50) {
    redirect("/panel/cobros?error=Ingresa+un+recargo+valido");
  }

  const admin = createAdminClient();
  await admin.from("organization_mercadopago_accounts")
    .update({ processing_fee_percent: fee, updated_at: new Date().toISOString() })
    .eq("organization_id", membership.organization_id);

  revalidatePath("/panel/cobros");
  redirect("/panel/cobros?guardado=1");
}

export default async function CobrosPage({
  searchParams,
}: {
  searchParams: Promise<{ conectado?: string; error?: string; guardado?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/panel");

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("organization_mercadopago_accounts")
    .select("mp_user_id, processing_fee_percent, connected_at")
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] text-[#f7f3ed] selection:bg-[#ff3b24] selection:text-white">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0">
        <div className="absolute -left-[260px] -top-[280px] h-[680px] w-[680px] rounded-full bg-[#ff2a1a]/[0.11] blur-[185px]" />
        <div className="absolute -right-[280px] top-[15%] h-[700px] w-[700px] rounded-full bg-[#ff5a2a]/[0.08] blur-[190px]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#050505]/85 backdrop-blur-2xl">
        <div className="mx-auto flex min-h-[80px] max-w-[1200px] items-center gap-4 px-5 py-4 md:px-8">
          <Link href="/panel" aria-label="Volver al panel" className="flex h-10 w-10 shrink-0 items-center justify-center border border-white/[0.09] bg-white/[0.02] text-white/45 transition hover:border-[#ff5a2a]/30 hover:text-white">
            ←
          </Link>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#ff6848]">Capital Pass</p>
            <h1 className="mt-1 text-xl font-black uppercase tracking-[-0.03em]">Cobros</h1>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-[1200px] px-5 py-10 md:px-8 lg:py-16">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff6040]">Venta pública online</p>
        <h2 className="mt-4 max-w-2xl text-4xl font-black uppercase leading-[0.9] tracking-[-0.05em] md:text-5xl">
          Conectá tu Mercado Pago.
        </h2>
        <p className="mt-5 max-w-xl text-sm leading-7 text-white/45">
          Compartí el link público de tu evento para que cualquiera compre su entrada online. La plata de esas ventas cae directo a tu propia cuenta de Mercado Pago — Capital Pass no cobra comisión.
        </p>

        {params.conectado && (
          <div className="mt-8 max-w-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-200">
            Tu cuenta de Mercado Pago quedó conectada.
          </div>
        )}
        {params.guardado && (
          <div className="mt-8 max-w-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-200">
            Recargo guardado.
          </div>
        )}
        {params.error && (
          <div className="mt-8 max-w-xl border border-red-400/25 bg-red-400/[0.06] px-4 py-3 text-sm text-red-200">
            {params.error}
          </div>
        )}

        <section className="mt-10 max-w-xl border border-white/[0.09] bg-[#0a0908]">
          <div className="border-b border-white/[0.07] p-6 md:p-8">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#ff6040]">
              {account ? "Conectada" : "Sin conectar"}
            </p>
            <h3 className="mt-2 text-2xl font-black uppercase tracking-[-0.035em]">
              {account ? "Tu Mercado Pago está listo" : "Todavía no conectaste tu cuenta"}
            </h3>
          </div>

          <div className="p-6 md:p-8">
            {account ? (
              <>
                <p className="text-sm leading-6 text-white/50">
                  Cuenta de Mercado Pago vinculada desde {new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(account.connected_at))}.
                </p>

                <form action={updateFee} className="mt-7 border-t border-white/[0.07] pt-6">
                  <label className="block text-[10px] font-black uppercase tracking-[0.13em] text-white/40">
                    Recargo por servicio (%)
                    <input
                      name="fee"
                      type="number"
                      step="0.01"
                      min="0"
                      max="49.99"
                      defaultValue={Number(account.processing_fee_percent)}
                      className="mt-3 h-12 w-full border border-white/[0.09] bg-black/35 px-4 text-sm text-white outline-none transition placeholder:text-white/15 focus:border-[#ff5a2a]/55 focus:bg-black/50"
                    />
                  </label>
                  <p className="mt-3 text-xs leading-6 text-white/35">
                    Se suma al precio de la entrada como un ítem aparte (&ldquo;Cargo por servicio&rdquo;) para compensar lo que te descuenta Mercado Pago. Dejalo en 0 si preferís absorber vos esa comisión.
                  </p>
                  <button
                    type="submit"
                    className="mt-6 flex h-12 items-center justify-center gap-3 bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] px-7 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-[0_12px_40px_rgba(255,42,26,.18)] transition hover:brightness-110"
                  >
                    Guardar recargo
                  </button>
                </form>

                <p className="mt-7 border-t border-white/[0.07] pt-6 text-xs leading-6 text-white/35">
                  ¿Querés elegir si el dinero se libera al instante o en unos días (con menos comisión de Mercado Pago)? Esa opción se configura dentro de tu propia cuenta de Mercado Pago, en Configuración de cobros — no depende de Capital Pass.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm leading-6 text-white/50">
                  Te vamos a redirigir a Mercado Pago para autorizar la conexión. Nunca vemos ni guardamos tu contraseña — solo un acceso para crear cobros en tu nombre.
                </p>
                <a
                  href="/api/mercadopago/oauth/start"
                  className="mt-7 inline-flex h-14 items-center bg-[#ff3b24] px-6 text-[11px] font-black uppercase tracking-[0.24em] text-white shadow-[0_18px_50px_rgba(255,59,36,.3)] transition hover:scale-[1.01] hover:bg-[#ff4a32] active:scale-[0.99]"
                >
                  Conectar mi Mercado Pago
                </a>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
