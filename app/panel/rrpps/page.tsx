import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { pickSelectedEvent } from "../../../lib/panel/selected-event";

import RRPPsClient from "./rrpps-client";

// ============================================================
// RRPPs - PANEL ORGANIZADOR
// ============================================================

export default async function RRPPsPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const { eventId: requestedEventId } = await searchParams;
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin =
    createAdminClient();

  // ==========================================================
  // ORGANIZADOR
  // ==========================================================

  const {
    data: membership,
  } = await admin
    .from("organization_members")
    .select(`
      id,
      organization_id,
      user_id,
      role,
      status
    `)
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return null;
  }

  // ==========================================================
  // ORGANIZACIÓN
  // ==========================================================

  const {
    data: organization,
  } = await admin
    .from("organizations")
    .select(`
      id,
      name
    `)
    .eq(
      "id",
      membership.organization_id
    )
    .maybeSingle();

  const organizationName =
    organization?.name ??
    "Organización";

  // ==========================================================
  // EVENTO ACTUAL
  // ==========================================================

  const {
    data: events,
  } = await admin
    .from("events")
    .select(`
      id,
      name,
      starts_at,
      status
    `)
    .eq(
      "organization_id",
      membership.organization_id
    )
    .order(
      "starts_at",
      {
        ascending: false,
      }
    );

  const event =
    await pickSelectedEvent(
      events ?? [],
      requestedEventId
    );

  // ==========================================================
  // SIN EVENTOS
  // ==========================================================

  if (!event) {
    return (
      <main className="min-h-screen bg-[#050505] text-[#f5f5f5] selection:bg-[#ff3b24] selection:text-white">
        <div className="flex min-h-screen">

          <aside className="relative hidden w-[255px] shrink-0 overflow-hidden border-r border-[#ff5a2a]/10 bg-[#080706] lg:flex lg:flex-col">

            <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_35%_0%,rgba(255,59,36,0.18),transparent_64%)]" />

            <div className="relative border-b border-white/[0.07] px-6 py-6">

              <Link
                href="/panel"
                className="flex items-center gap-3"
              >
                <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-[#ff2a1a] via-[#ff3b24] to-[#ff5a2a] font-black shadow-[0_10px_35px_rgba(255,42,26,.28)] before:absolute before:inset-x-1 before:top-1 before:h-1/2 before:rounded-xl before:bg-gradient-to-b before:from-white/35 before:to-transparent">
                  CP
                </div>

                <div>
                  <p className="font-semibold">
                    Capital Pass
                  </p>

                  <p className="text-xs text-white/30">
                    Event Management
                  </p>
                </div>
              </Link>

            </div>

          </aside>

          <section className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#050505] p-6">

            <div className="pointer-events-none absolute right-[-180px] top-[-200px] h-[560px] w-[560px] rounded-full bg-[#ff2a1a]/20 blur-[150px]" />
            <div className="pointer-events-none absolute bottom-[-240px] left-[10%] h-[520px] w-[520px] rounded-full bg-[#ff5a2a]/[0.09] blur-[150px]" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:72px_72px]" />

            <div className="relative max-w-lg rounded-[28px] border border-[#ff5a2a]/15 bg-[linear-gradient(145deg,rgba(17,14,12,.96),rgba(8,7,6,.98))] p-8 text-center shadow-[0_30px_120px_rgba(255,42,26,.14)]">

              <p className="text-xs uppercase tracking-[0.18em] text-[#ff6040]">
                RRPPs
              </p>

              <h1 className="mt-3 text-4xl font-black uppercase tracking-[-0.04em]">
                No hay eventos
              </h1>

              <p className="mt-3 text-sm leading-6 text-white/35">
                Primero necesitás crear un evento para poder asignar RRPPs.
              </p>

              <Link
                href="/panel"
                className="mt-7 inline-flex h-12 items-center justify-center bg-gradient-to-r from-[#ff2a1a] to-[#ff5a2a] px-6 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-[0_12px_40px_rgba(255,42,26,.20)] transition hover:brightness-110"
              >
                Volver al inicio
              </Link>

            </div>

          </section>

        </div>
      </main>
    );
  }

  // ==========================================================
  // MIEMBROS RRPP
  // ==========================================================

  const {
    data: rrppMembersData,
  } = await admin
    .from("organization_members")
    .select(`
      id,
      user_id,
      status
    `)
    .eq(
      "organization_id",
      membership.organization_id
    )
    .eq(
      "role",
      "rrpp"
    );

  const rrppMembers =
    rrppMembersData ?? [];

  const memberIds =
    rrppMembers.map(
      (member) =>
        member.id
    );

  const userIds =
    rrppMembers.map(
      (member) =>
        member.user_id
    );

  // ==========================================================
  // PERFILES
  // ==========================================================

  let profiles: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  }[] = [];

  if (
    userIds.length > 0
  ) {
    const {
      data: profileRows,
    } = await admin
      .from("profiles")
      .select(`
        id,
        first_name,
        last_name
      `)
      .in(
        "id",
        userIds
      );

    profiles =
      (profileRows ??
        []) as typeof profiles;
  }

  const profileMap =
    new Map(
      profiles.map(
        (profile) => [
          profile.id,
          profile,
        ]
      )
    );

  const memberMap =
    new Map(
      rrppMembers.map(
        (member) => [
          member.id,
          member,
        ]
      )
    );

  // ==========================================================
  // ASIGNACIONES RRPP
  // ==========================================================

  let staffRows: {
    id: string;
    organization_member_id: string;
    active: boolean;

    assigned_province:
      | string
      | null;

    assigned_province_id:
      | string
      | null;

    assigned_city:
      | string
      | null;

    assigned_locality_id:
      | string
      | null;

    assigned_zone:
      | string
      | null;

    assigned_lat:
      | number
      | string
      | null;

    assigned_lng:
      | number
      | string
      | null;

    location_label:
      | string
      | null;

    commission_percentage:
      | number
      | string
      | null;
  }[] = [];

  if (
    memberIds.length > 0
  ) {
    const {
      data: staffData,
    } = await admin
      .from("event_staff")
      .select(`
        id,
        organization_member_id,
        active,
        assigned_province,
        assigned_province_id,
        assigned_city,
        assigned_locality_id,
        assigned_zone,
        assigned_lat,
        assigned_lng,
        location_label,
        commission_percentage
      `)
      .eq(
        "event_id",
        event.id
      )
      .eq(
        "staff_role",
        "rrpp"
      )
      .in(
        "organization_member_id",
        memberIds
      );

    staffRows =
      (staffData ??
        []) as typeof staffRows;
  }

  const assignedMemberIds =
    staffRows.map(
      (staff) =>
        staff.organization_member_id
    );

  // ==========================================================
  // VENTAS RRPP
  // ==========================================================

  let sales: {
    id: string;

    seller_member_id:
      | string
      | null;

    total_minor:
      | number
      | string;

    status: string;
    channel: string;
  }[] = [];

  if (
    assignedMemberIds.length > 0
  ) {
    const {
      data: salesData,
    } = await admin
      .from("sales")
      .select(`
        id,
        seller_member_id,
        total_minor,
        status,
        channel
      `)
      .eq(
        "event_id",
        event.id
      )
      .eq(
        "status",
        "confirmed"
      )
      .eq(
        "channel",
        "rrpp"
      )
      .in(
        "seller_member_id",
        assignedMemberIds
      );

    sales =
      (salesData ??
        []) as typeof sales;
  }

  const saleIds =
    sales.map(
      (sale) =>
        sale.id
    );

  // ==========================================================
  // TICKETS
  // ==========================================================

  let tickets: {
    id: string;
    sale_id: string;
    status: string;
  }[] = [];

  if (
    saleIds.length > 0
  ) {
    const {
      data: ticketRows,
    } = await admin
      .from("tickets")
      .select(`
        id,
        sale_id,
        status
      `)
      .eq(
        "event_id",
        event.id
      )
      .in(
        "sale_id",
        saleIds
      );

    tickets =
      (ticketRows ??
        []) as typeof tickets;
  }

  // ==========================================================
  // PAGOS DE COMISIONES
  // ==========================================================

  let payments: {
    organization_member_id: string;

    amount_minor:
      | number
      | string;
  }[] = [];

  if (
    assignedMemberIds.length > 0
  ) {
    const {
      data: paymentRows,
    } = await admin
      .from(
        "rrpp_commission_payments"
      )
      .select(`
        organization_member_id,
        amount_minor
      `)
      .eq(
        "event_id",
        event.id
      )
      .in(
        "organization_member_id",
        assignedMemberIds
      );

    payments =
      (paymentRows ??
        []) as typeof payments;
  }

  // ==========================================================
  // TICKETS POR VENTA
  // ==========================================================

  const ticketsBySale =
    new Map<
      string,
      number
    >();

  for (
    const ticket of tickets
  ) {
    if (
      ticket.status ===
      "cancelled"
    ) {
      continue;
    }

    const current =
      ticketsBySale.get(
        ticket.sale_id
      ) ?? 0;

    ticketsBySale.set(
      ticket.sale_id,
      current + 1
    );
  }

  // ==========================================================
  // RENDIMIENTO POR RRPP
  // ==========================================================

  const salesByMember =
    new Map<
      string,
      {
        salesCount: number;
        ticketsSold: number;
        totalSold: number;
      }
    >();

  for (
    const sale of sales
  ) {
    if (
      !sale.seller_member_id
    ) {
      continue;
    }

    const current =
      salesByMember.get(
        sale.seller_member_id
      ) ?? {
        salesCount: 0,
        ticketsSold: 0,
        totalSold: 0,
      };

    current.salesCount += 1;

    current.ticketsSold +=
      ticketsBySale.get(
        sale.id
      ) ?? 0;

    current.totalSold +=
      Number(
        sale.total_minor ??
          0
      );

    salesByMember.set(
      sale.seller_member_id,
      current
    );
  }

  // ==========================================================
  // PAGOS POR RRPP
  // ==========================================================

  const paidByMember =
    new Map<
      string,
      number
    >();

  for (
    const payment of payments
  ) {
    const current =
      paidByMember.get(
        payment.organization_member_id
      ) ?? 0;

    paidByMember.set(
      payment.organization_member_id,
      current +
        Number(
          payment.amount_minor ??
            0
        )
    );
  }

  // ==========================================================
  // ARMAR RRPPs
  // ==========================================================

  const rrpps =
    staffRows
      .map((staff) => {
        const member =
          memberMap.get(
            staff.organization_member_id
          );

        if (!member) {
          return null;
        }

        const profile =
          profileMap.get(
            member.user_id
          );

        const performance =
          salesByMember.get(
            member.id
          ) ?? {
            salesCount: 0,
            ticketsSold: 0,
            totalSold: 0,
          };

        const commissionPercentage =
          Number(
            staff.commission_percentage ??
              0
          );

        const commissionGenerated =
          Math.round(
            performance.totalSold *
              (
                commissionPercentage /
                100
              )
          );

        const commissionPaid =
          paidByMember.get(
            member.id
          ) ?? 0;

        const commissionPending =
          Math.max(
            0,
            commissionGenerated -
              commissionPaid
          );

        const lat =
          staff.assigned_lat ===
            null ||
          staff.assigned_lat ===
            undefined
            ? null
            : Number(
                staff.assigned_lat
              );

        const lng =
          staff.assigned_lng ===
            null ||
          staff.assigned_lng ===
            undefined
            ? null
            : Number(
                staff.assigned_lng
              );

        return {
          memberId:
            member.id,

          eventStaffId:
            staff.id,

          firstName:
            profile?.first_name?.trim() ||
            "RRPP",

          lastName:
            profile?.last_name?.trim() ||
            "",

          active:
            member.status ===
              "active" &&
            Boolean(
              staff.active
            ),

          // ----------------------------------------------
          // UBICACIÓN
          // ----------------------------------------------

          assignedProvince:
            staff.assigned_province,

          assignedProvinceId:
            staff.assigned_province_id,

          assignedCity:
            staff.assigned_city,

          assignedLocalityId:
            staff.assigned_locality_id,

          assignedZone:
            staff.assigned_zone,

          assignedLat:
            Number.isFinite(lat)
              ? lat
              : null,

          assignedLng:
            Number.isFinite(lng)
              ? lng
              : null,

          locationLabel:
            staff.location_label,

          // ----------------------------------------------
          // COMISIÓN / VENTAS
          // ----------------------------------------------

          commissionPercentage,

          salesCount:
            performance.salesCount,

          ticketsSold:
            performance.ticketsSold,

          totalSold:
            performance.totalSold,

          commissionGenerated,

          commissionPaid,

          commissionPending,
        };
      })
      .filter(
        (
          rrpp
        ): rrpp is NonNullable<
          typeof rrpp
        > =>
          rrpp !== null
      )
      .sort(
        (a, b) =>
          b.totalSold -
          a.totalSold
      );

  // ==========================================================
  // MÉTRICAS
  // ==========================================================

  const totalRRPPs =
    rrpps.length;

  const activeRRPPs =
    rrpps.filter(
      (rrpp) =>
        rrpp.active
    ).length;

  const totalSold =
    rrpps.reduce(
      (
        total,
        rrpp
      ) =>
        total +
        rrpp.totalSold,
      0
    );

  const commissionsGenerated =
    rrpps.reduce(
      (
        total,
        rrpp
      ) =>
        total +
        rrpp.commissionGenerated,
      0
    );

  const commissionsPaid =
    rrpps.reduce(
      (
        total,
        rrpp
      ) =>
        total +
        rrpp.commissionPaid,
      0
    );

  const commissionsPending =
    rrpps.reduce(
      (
        total,
        rrpp
      ) =>
        total +
        rrpp.commissionPending,
      0
    );

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <RRPPsClient
      events={(events ?? []).map(
        (item) => ({
          id: item.id,
          name: item.name,
        })
      )}
      event={{
        id:
          event.id,

        name:
          event.name,
      }}
      organizationName={
        organizationName
      }
      rrpps={rrpps}
      metrics={{
        totalRRPPs,
        activeRRPPs,
        totalSold,
        commissionsGenerated,
        commissionsPaid,
        commissionsPending,
      }}
    />
  );
}
