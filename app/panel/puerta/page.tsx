import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { pickSelectedEvent } from "../../../lib/panel/selected-event";

import PuertaPanelClient from "./puerta-panel-client";

export default async function PuertaPanelPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select(`
      id,
      organization_id
    `)
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return null;
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", membership.organization_id)
    .maybeSingle();

  const { data: events } = await supabase
    .from("events")
    .select(`
      id,
      name,
      door_sales_enabled,
      door_sales_start_at,
      door_sales_end_at
    `)
    .eq("organization_id", membership.organization_id)
    .order("starts_at", { ascending: false })
    .order("created_at", { ascending: false });

  const event = await pickSelectedEvent(events ?? []);

  if (!event) {
    return (
      <main className="relative min-h-screen overflow-x-hidden bg-[#050505] text-[#f7f3ed] selection:bg-[#ff3b24] selection:text-white">
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -left-[260px] -top-[280px] h-[680px] w-[680px] rounded-full bg-[#ff2a1a]/[0.11] blur-[185px]" />
          <div className="absolute -right-[280px] top-[15%] h-[700px] w-[700px] rounded-full bg-[#ff5a2a]/[0.08] blur-[190px]" />
          <div className="absolute bottom-[-350px] left-[25%] h-[650px] w-[820px] rounded-[50%] bg-[radial-gradient(ellipse_at_top,rgba(255,124,76,.18)_0%,rgba(255,59,36,.09)_25%,rgba(76,14,7,.06)_50%,transparent_72%)] blur-[40px]" />
          <div className="absolute inset-0 opacity-[0.033]">
            <div className="h-full w-full bg-[radial-gradient(circle,white_0.6px,transparent_0.8px)] bg-[size:5px_5px]" />
          </div>
        </div>

        <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#050505]/85 backdrop-blur-2xl">
          <div className="mx-auto flex min-h-[80px] max-w-[1480px] items-center gap-4 px-5 py-4 md:px-8 xl:px-10">
            <Link
              href="/panel"
              aria-label="Volver al panel"
              className="flex h-10 w-10 shrink-0 items-center justify-center border border-white/[0.09] bg-white/[0.02] text-white/45 transition hover:border-[#ff5a2a]/30 hover:bg-[#ff3b24]/[0.04] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff9272]"
            >
              <span aria-hidden="true">←</span>
            </Link>
            <div className="flex min-w-0 items-center gap-3">
              <div aria-hidden="true" className="relative hidden h-9 w-9 shrink-0 overflow-hidden sm:block">
                <div className="absolute inset-[5px] rotate-[-18deg] rounded-[45%_55%_65%_35%] bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff6530] shadow-[0_0_22px_rgba(255,59,36,.2)]" />
                <div className="absolute inset-[7px] rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.6),transparent_35%)]" />
              </div>
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase tracking-[0.24em] text-[#ff7354]">
                  Event control
                </p>
                <p className="mt-1 text-sm font-black uppercase tracking-[-0.02em] text-white/80">
                  Venta en puerta
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="relative z-10 mx-auto max-w-[1480px] px-5 py-9 md:px-8 xl:px-10">
          <section className="mb-8 grid gap-7 border-b border-white/[0.07] pb-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-end">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-3 border border-[#ff5a2a]/20 bg-[#ff3b24]/[0.055] px-4 py-2">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#ff3b24] shadow-[0_0_12px_#ff3b24]" />
                <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#ff9272]">
                  Gestión de boletería
                </span>
              </div>
              <h1 className="mt-7 text-[clamp(44px,6vw,82px)] font-black uppercase leading-[0.84] tracking-[-0.065em]">
                No hay
                <span className="block bg-gradient-to-r from-[#fff2ea] via-[#ff8c69] to-[#ff2a1a] bg-clip-text text-transparent">
                  eventos.
                </span>
              </h1>
            </div>
            <p className="max-w-[420px] text-sm leading-7 text-white/45">
              No hay ningún evento disponible. Primero necesitás crear uno
              para poder gestionar sus vendedores de puerta.
            </p>
          </section>

          <section className="border border-white/[0.09] bg-[#0a0908]/90 p-5 shadow-[0_25px_80px_rgba(0,0,0,.22),inset_0_1px_0_rgba(255,255,255,.03)] backdrop-blur-xl md:p-6">
            <p className="text-[9px] font-black uppercase tracking-[0.20em] text-[#ff7958]">
              Capital Pass / Boletería
            </p>
            <h2 className="mt-3 text-xl font-black uppercase tracking-[-0.025em]">
              Todo empieza con tu evento.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/45">
              Desde el panel podés acceder a tus eventos. Después, volvé acá
              para administrar tu equipo y consultar los horarios de venta.
            </p>
            <Link
              href="/panel"
              className="mt-6 inline-flex min-h-[44px] items-center justify-center bg-gradient-to-r from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] px-5 py-3 text-[9px] font-black uppercase tracking-[0.15em] text-white shadow-[0_14px_40px_rgba(255,59,36,.16)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff9272]"
            >
              Volver al panel
            </Link>
          </section>
        </div>
      </main>
    );
  }

  const admin = createAdminClient();

  const { data: memberRows } = await admin
    .from("organization_members")
    .select(`
      id,
      user_id,
      status
    `)
    .eq("organization_id", membership.organization_id)
    .eq("role", "door_seller");

  const members = memberRows ?? [];
  const memberIds = members.map((member) => member.id);
  const userIds = members.map((member) => member.user_id);

  let profiles: {
    id: string;
    first_name: string;
    last_name: string;
  }[] = [];

  if (userIds.length > 0) {
    const { data: profileRows } = await admin
      .from("profiles")
      .select(`
        id,
        first_name,
        last_name
      `)
      .in("id", userIds);

    profiles = (profileRows ?? []) as typeof profiles;
  }

  let assignments: {
    organization_member_id: string;
    active: boolean;
  }[] = [];

  if (memberIds.length > 0) {
    const { data: staffRows } = await admin
      .from("event_staff")
      .select(`
        organization_member_id,
        active
      `)
      .eq("event_id", event.id)
      .eq("staff_role", "door_seller")
      .in("organization_member_id", memberIds);

    assignments = (staffRows ?? []) as typeof assignments;
  }

  const profileMap = new Map(
    profiles.map((profile) => [profile.id, profile])
  );

  const assignmentMap = new Map(
    assignments.map((assignment) => [
      assignment.organization_member_id,
      assignment,
    ])
  );

  const sellers = members.map((member) => {
    const profile = profileMap.get(member.user_id);
    const assignment = assignmentMap.get(member.id);

    return {
      memberId: member.id,
      firstName: profile?.first_name ?? "Vendedor",
      lastName: profile?.last_name ?? "Puerta",
      active: member.status === "active" && Boolean(assignment?.active),
    };
  });

  return (
    <PuertaPanelClient
      events={(events ?? []).map((item) => ({ id: item.id, name: item.name }))}
      event={{
        id: event.id,
        name: event.name,
        doorSalesEnabled: event.door_sales_enabled,
        doorSalesStartAt: event.door_sales_start_at,
        doorSalesEndAt: event.door_sales_end_at,
      }}
      organizationName={organization?.name ?? "Organización"}
      sellers={sellers}
    />
  );
}

