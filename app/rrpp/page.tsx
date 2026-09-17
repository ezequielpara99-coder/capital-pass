import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

type Membership = {
  id: string;
  organization_id: string;
};

type Profile = {
  first_name: string;
  last_name: string;
};

type Staff = {
  event_id: string;
};

type EventRow = {
  id: string;
  name: string;
  starts_at: string | null;
};

type Sale = {
  id: string;
  total_minor: number | string;
  created_at: string;
};

type SaleItem = {
  sale_id: string;
  quantity: number;
};

function money(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "Fecha a confirmar";

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default async function RRPPPage() {
  const supabase = await createClient();

  // =====================================================
  // 1. USUARIO AUTENTICADO
  // =====================================================

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // =====================================================
  // 2. VERIFICAR QUE SEA RRPP
  // =====================================================

  const { data: membership } = await supabase
    .from("organization_members")
    .select("id, organization_id")
    .eq("user_id", user.id)
    .eq("role", "rrpp")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    // Si es organizador, vuelve a su panel.
    const { data: organizer } = await supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "organizer")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (organizer) {
      redirect("/panel");
    }

    redirect("/login");
  }

  const rrppMembership = membership as Membership;

  // =====================================================
  // 3. PERFIL
  // =====================================================

  const { data: profileData } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  const profile = profileData as Profile | null;

  const firstName = profile?.first_name || "RRPP";
  const fullName = profile
    ? `${profile.first_name} ${profile.last_name}`
    : user.email || "RRPP";

  // =====================================================
  // 4. EVENTOS ASIGNADOS
  // =====================================================

  const { data: staffData } = await supabase
    .from("event_staff")
    .select("event_id")
    .eq("organization_member_id", rrppMembership.id)
    .eq("staff_role", "rrpp")
    .eq("active", true);

  const staff = (staffData ?? []) as Staff[];

  const eventIds = staff.map((item) => item.event_id);

  let events: EventRow[] = [];

  if (eventIds.length > 0) {
    const { data: eventsData } = await supabase
      .from("events")
      .select("id, name, starts_at")
      .in("id", eventIds)
      .order("starts_at", { ascending: true });

    events = (eventsData ?? []) as EventRow[];
  }

  const selectedEvent = events[0] ?? null;

  // =====================================================
  // 5. VENTAS DEL RRPP
  // =====================================================

  let sales: Sale[] = [];
  let ticketsSold = 0;
  let totalSold = 0;

  if (selectedEvent) {
    const { data: salesData } = await supabase
      .from("sales")
      .select("id, total_minor, created_at")
      .eq("event_id", selectedEvent.id)
      .eq("seller_member_id", rrppMembership.id)
      .eq("channel", "rrpp")
      .eq("status", "confirmed")
      .order("created_at", { ascending: false });

    sales = (salesData ?? []) as Sale[];

    totalSold = sales.reduce(
      (total, sale) =>
        total + Number(sale.total_minor ?? 0),
      0
    );

    if (sales.length > 0) {
      const saleIds = sales.map((sale) => sale.id);

      const { data: itemsData } = await supabase
        .from("sale_items")
        .select("sale_id, quantity")
        .in("sale_id", saleIds);

      const saleItems = (itemsData ?? []) as SaleItem[];

      ticketsSold = saleItems.reduce(
        (total, item) =>
          total + Number(item.quantity ?? 0),
        0
      );
    }
  }

  // =====================================================
  // PANTALLA
  // =====================================================

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07050a] text-white">
      {/* FONDO */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-200px] top-[-150px] h-[500px] w-[500px] rounded-full bg-[#ff2a1a]/[0.14] blur-[130px]" />

        <div className="absolute bottom-[-200px] right-[-150px] h-[500px] w-[500px] rounded-full bg-[#ff5a2a]/[0.10] blur-[130px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-5 py-7 sm:px-7 sm:py-10">
        {/* HEADER */}
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative h-11 w-11 overflow-hidden">
              <div className="absolute inset-[5px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_24px_rgba(255,59,36,.25)]" />
            </div>

            <div>
              <p className="font-semibold">
                Capital Pass
              </p>

              <p className="text-xs text-white/35">
                Panel RRPP
              </p>
            </div>
          </div>

          <form action="/auth/signout" method="post">
            <a
              href="/login"
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-white/55 transition hover:bg-white/[0.08] hover:text-white"
            >
              Salir
            </a>
          </form>
        </header>

        {/* SALUDO */}
        <section className="mb-7">
          <p className="text-sm text-[#ff9b82]">
            EQUIPO DE VENTAS
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Hola, {firstName} 👋
          </h1>

          <p className="mt-2 text-sm text-white/40">
            {fullName}
          </p>
        </section>

        {!selectedEvent ? (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.035] px-6 py-14 text-center backdrop-blur-xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ff3b24]/10 text-xl">
              🎟️
            </div>

            <h2 className="text-lg font-semibold">
              No tenés eventos asignados
            </h2>

            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-white/40">
              Cuando un organizador te asigne a un
              evento, aparecerá acá automáticamente.
            </p>
          </div>
        ) : (
          <>
            {/* EVENTO */}
            <section className="mb-5 rounded-[26px] border border-[#ff5a2a]/20 bg-gradient-to-br from-[#ff3b24]/[0.10] to-[#ff5a2a]/[0.04] p-6 shadow-[0_0_50px_rgba(255,59,36,.12)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ff9b82]">
                Evento asignado
              </p>

              <h2 className="mt-3 text-2xl font-bold">
                {selectedEvent.name}
              </h2>

              <p className="mt-2 text-sm text-white/40">
                {formatDate(selectedEvent.starts_at)}
              </p>

              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                HABILITADO PARA VENDER
              </div>
            </section>

            {/* MÉTRICAS */}
            <section className="mb-5 grid grid-cols-2 gap-4">
              <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
                <p className="text-xs uppercase tracking-[0.14em] text-white/30">
                  Entradas vendidas
                </p>

                <p className="mt-3 text-3xl font-bold">
                  {ticketsSold}
                </p>

                <p className="mt-1 text-xs text-white/25">
                  Tus ventas
                </p>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
                <p className="text-xs uppercase tracking-[0.14em] text-white/30">
                  Total vendido
                </p>

                <p className="mt-3 text-xl font-bold sm:text-2xl">
                  {money(totalSold)}
                </p>

                <p className="mt-1 text-xs text-white/25">
                  Ventas confirmadas
                </p>
              </div>
            </section>

            {/* NUEVA VENTA */}
            <section className="mb-7 rounded-[28px] border border-[#ff5a2a]/20 bg-white/[0.035] p-5 backdrop-blur-xl">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold">
                    Nueva venta
                  </p>

                  <p className="mt-1 text-sm text-white/35">
                    Registrá una entrada para un comprador.
                  </p>
                </div>

                <a
                  href="/rrpp/nueva-venta"
                  className="rounded-2xl bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] px-7 py-3.5 text-center text-sm font-bold text-white"
                >
                  + Nueva venta
                </a>
              </div>
            </section>

            {/* VENDER MESA */}
            <section className="mb-7 rounded-[28px] border border-[#ff5a2a]/20 bg-white/[0.035] p-5 backdrop-blur-xl">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold">
                    Vender mesa
                  </p>

                  <p className="mt-1 text-sm text-white/35">
                    Reservá una mesa para un cliente.
                  </p>
                </div>

                <a
                  href="/rrpp/mesas"
                  className="rounded-2xl bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] px-7 py-3.5 text-center text-sm font-bold text-white"
                >
                  🪑 Vender mesa
                </a>
              </div>
            </section>

            {/* ÚLTIMAS VENTAS */}
            <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035] backdrop-blur-xl">
              <div className="border-b border-white/10 px-6 py-5">
                <h2 className="font-semibold">
                  Mis últimas ventas
                </h2>

                <p className="mt-1 text-xs text-white/35">
                  Solo podés ver tus propias ventas.
                </p>
              </div>

              {sales.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-white/40">
                    Todavía no registraste ventas.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.07]">
                  {sales.slice(0, 5).map((sale) => (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between gap-4 px-6 py-4"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          Venta confirmada
                        </p>

                        <p className="mt-1 text-xs text-white/30">
                          {new Intl.DateTimeFormat(
                            "es-AR",
                            {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          ).format(
                            new Date(sale.created_at)
                          )}
                        </p>
                      </div>

                      <p className="font-semibold">
                        {money(
                          Number(sale.total_minor ?? 0)
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}