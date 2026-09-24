import { NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { pickSelectedEvent } from "../../../../lib/panel/selected-event";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "No autorizado." },
        { status: 401 }
      );
    }

    const admin = createAdminClient();

    const { data: membership } = await admin
      .from("organization_members")
      .select("id, organization_id")
      .eq("user_id", user.id)
      .eq("role", "organizer")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json(
        { error: "No tenés permisos de organizador." },
        { status: 403 }
      );
    }

    const { data: events } = await admin
      .from("events")
      .select("id, name, starts_at")
      .eq("organization_id", membership.organization_id)
      .order("starts_at", { ascending: false })
      .order("created_at", { ascending: false });

    const event = await pickSelectedEvent(events ?? []);

    if (!event) {
      return NextResponse.json(emptyResponse(null));
    }

    const { data: staffData } = await admin
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
        location_label
      `)
      .eq("event_id", event.id)
      .eq("staff_role", "rrpp");

    const staffRows = staffData ?? [];
    const memberIds = staffRows.map((staff) => staff.organization_member_id);

    if (memberIds.length === 0) {
      return NextResponse.json(
        emptyResponse({
          id: event.id,
          name: event.name,
        })
      );
    }

    const { data: membersData } = await admin
      .from("organization_members")
      .select("id, user_id, status")
      .eq("organization_id", membership.organization_id)
      .eq("role", "rrpp")
      .in("id", memberIds);

    const members = membersData ?? [];
    const memberMap = new Map(members.map((member) => [member.id, member]));
    const userIds = members.map((member) => member.user_id);

    let profiles: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      email: string | null;
    }[] = [];

    if (userIds.length > 0) {
      const { data: profileData } = await admin
        .from("profiles")
        .select("id, first_name, last_name, phone, email")
        .in("id", userIds);

      profiles = (profileData ?? []) as typeof profiles;
    }

    const profileMap = new Map(
      profiles.map((profile) => [profile.id, profile])
    );

    // Venta RRPP real del evento -- sin esto, la tarjeta de cobertura
    // mostraba siempre $0 vendido y 0 entradas por vendedor, aunque
    // estuvieran facturando (quedaba hardcodeado en vez de calculado).
    const { data: salesData } = await admin
      .from("sales")
      .select("id, seller_member_id, total_minor")
      .eq("event_id", event.id)
      .eq("status", "confirmed")
      .eq("channel", "rrpp")
      .in("seller_member_id", memberIds);

    const sales = salesData ?? [];
    const saleIds = sales.map((sale) => sale.id);

    let tickets: { id: string; sale_id: string; status: string }[] = [];

    if (saleIds.length > 0) {
      const { data: ticketData } = await admin
        .from("tickets")
        .select("id, sale_id, status")
        .eq("event_id", event.id)
        .in("sale_id", saleIds);

      tickets = (ticketData ?? []) as typeof tickets;
    }

    const ticketsBySale = new Map<string, number>();
    for (const ticket of tickets) {
      if (ticket.status === "cancelled") continue;
      ticketsBySale.set(ticket.sale_id, (ticketsBySale.get(ticket.sale_id) ?? 0) + 1);
    }

    const performanceByMember = new Map<
      string,
      { salesCount: number; ticketsSold: number; totalSold: number }
    >();

    for (const sale of sales) {
      if (!sale.seller_member_id) continue;

      const current = performanceByMember.get(sale.seller_member_id) ?? {
        salesCount: 0,
        ticketsSold: 0,
        totalSold: 0,
      };

      current.salesCount += 1;
      current.ticketsSold += ticketsBySale.get(sale.id) ?? 0;
      current.totalSold += Number(sale.total_minor ?? 0);

      performanceByMember.set(sale.seller_member_id, current);
    }

    const rrpps = staffRows
      .map((staff) => {
        const member = memberMap.get(staff.organization_member_id);

        if (!member) {
          return null;
        }

        const profile = profileMap.get(member.user_id);

        const performance = performanceByMember.get(member.id) ?? {
          salesCount: 0,
          ticketsSold: 0,
          totalSold: 0,
        };

        const locationLabel = [
          staff.assigned_city,
          staff.assigned_zone,
          staff.assigned_province,
        ]
          .filter(Boolean)
          .join(" · ");

        const lat = coordinateFrom(staff.assigned_lat);
        const lng = coordinateFrom(staff.assigned_lng);

        return {
          memberId: member.id,
          eventStaffId: staff.id,
          firstName: profile?.first_name?.trim() || "RRPP",
          lastName: profile?.last_name?.trim() || "",
          phone: profile?.phone ?? null,
          email: profile?.email ?? null,
          active:
            member.status === "active" &&
            Boolean(staff.active),
          province: staff.assigned_province ?? null,
          provinceId: staff.assigned_province_id ?? null,
          city: staff.assigned_city ?? null,
          localityId: staff.assigned_locality_id ?? null,
          zone: staff.assigned_zone ?? null,
          lat,
          lng,
          locationLabel:
            staff.location_label ??
            (locationLabel ? locationLabel : null),
          mapped: lat !== null && lng !== null,
          salesCount: performance.salesCount,
          ticketsSold: performance.ticketsSold,
          totalSold: performance.totalSold,
        };
      })
      .filter((rrpp): rrpp is NonNullable<typeof rrpp> => rrpp !== null)
      .sort((a, b) => {
        if (a.active !== b.active) {
          return a.active ? -1 : 1;
        }

        return `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`,
          "es"
        );
      });

    const activeRRPPs = rrpps.filter((rrpp) => rrpp.active).length;

    const cities = new Set(
      rrpps
        .map((rrpp) => rrpp.city?.trim().toLocaleLowerCase("es-AR"))
        .filter(Boolean)
    );

    const zones = new Set(
      rrpps
        .filter((rrpp) => rrpp.city || rrpp.zone)
        .map(
          (rrpp) =>
            `${(rrpp.city ?? "").trim().toLocaleLowerCase("es-AR")}|${(
              rrpp.zone ?? ""
            )
              .trim()
              .toLocaleLowerCase("es-AR")}`
        )
    );

    const totalSold = rrpps.reduce((total, rrpp) => total + rrpp.totalSold, 0);
    const ticketsSold = rrpps.reduce((total, rrpp) => total + rrpp.ticketsSold, 0);

    return NextResponse.json({
      ok: true,
      event: {
        id: event.id,
        name: event.name,
      },
      rrpps,
      metrics: {
        totalRRPPs: rrpps.length,
        activeRRPPs,
        mappedRRPPs: rrpps.filter((rrpp) => rrpp.mapped).length,
        unmappedRRPPs: rrpps.filter((rrpp) => !rrpp.mapped).length,
        totalZones: zones.size,
        totalCities: cities.size,
        totalSold,
        ticketsSold,
      },
    });
  } catch (error) {
    console.error("GET /api/rrpps/cobertura", error);

    return NextResponse.json(
      { error: "No se pudo cargar la cobertura de RRPPs." },
      { status: 500 }
    );
  }
}

function coordinateFrom(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function emptyResponse(event: { id: string; name: string } | null) {
  return {
    ok: true,
    event,
    rrpps: [],
    metrics: {
      totalRRPPs: 0,
      activeRRPPs: 0,
      mappedRRPPs: 0,
      unmappedRRPPs: 0,
      totalZones: 0,
      totalCities: 0,
      totalSold: 0,
      ticketsSold: 0,
    },
  };
}
