import { NextResponse } from "next/server";

import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { hasStockAccess, isPlatformAdmin } from "../../../../lib/stock/auth";
import { pickSelectedEvent } from "../../../../lib/panel/selected-event";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
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
      return NextResponse.json({ error: "No tenés permisos de organizador." }, { status: 403 });
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

    const admin_ok = (await isPlatformAdmin(user.id, user.email)) || (await hasStockAccess(membership.organization_id));
    if (!admin_ok) {
      return NextResponse.json({ ...emptyResponse({ id: event.id, name: event.name }), requiresUpgrade: true });
    }

    const [{ data: barsData }, { data: staffData }] = await Promise.all([
      admin.from("bars").select("id, name").eq("event_id", event.id),
      admin
        .from("event_staff")
        .select("id, organization_member_id, bar_id, active")
        .eq("event_id", event.id)
        .eq("staff_role", "bartender"),
    ]);

    const bars = barsData ?? [];
    const barNameById = new Map(bars.map((bar) => [bar.id, bar.name]));
    const staffRows = staffData ?? [];
    const memberIds = staffRows.map((staff) => staff.organization_member_id);

    if (memberIds.length === 0) {
      return NextResponse.json({
        ...emptyResponse({ id: event.id, name: event.name }),
        metrics: { ...emptyMetrics(), totalBars: bars.length },
      });
    }

    const { data: membersData } = await admin
      .from("organization_members")
      .select("id, user_id, status")
      .eq("organization_id", membership.organization_id)
      .eq("role", "bartender")
      .in("id", memberIds);

    const members = membersData ?? [];
    const memberMap = new Map(members.map((member) => [member.id, member]));
    const userIds = members.map((member) => member.user_id);

    let profiles: { id: string; first_name: string | null; last_name: string | null }[] = [];
    if (userIds.length > 0) {
      const { data: profileData } = await admin
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", userIds);
      profiles = profileData ?? [];
    }
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

    const { data: barSalesData } = await admin
      .from("bar_sales")
      .select("bar_id, bartender_member_id, quantity, total_minor, payment_method")
      .eq("event_id", event.id)
      .is("cancelled_at", null);

    const barSales = barSalesData ?? [];

    const salesByMember = new Map<
      string,
      { salesCount: number; itemsSold: number; totalSoldMinor: number }
    >();
    let totalSoldMinor = 0;
    let comboValueMinor = 0;

    for (const sale of barSales) {
      // total_minor es bigint: PostgREST lo serializa como STRING, no
      // como number. Sin el Number() de aca, "0 + string" en JS concatena
      // texto en vez de sumar (0 + "1500" -> "01500") -- con 2+ ventas,
      // todos los totales de este endpoint quedaban corrompidos.
      const isCombo = sale.payment_method === "combo";
      const saleMoney = isCombo ? 0 : Number(sale.total_minor);

      totalSoldMinor += saleMoney;
      if (isCombo) comboValueMinor += Number(sale.total_minor);

      const row = salesByMember.get(sale.bartender_member_id) ?? {
        salesCount: 0,
        itemsSold: 0,
        totalSoldMinor: 0,
      };
      row.salesCount += 1;
      row.itemsSold += sale.quantity;
      row.totalSoldMinor += saleMoney;
      salesByMember.set(sale.bartender_member_id, row);
    }

    const bartenders = staffRows
      .map((staff) => {
        const member = memberMap.get(staff.organization_member_id);
        if (!member) return null;

        const profile = profileMap.get(member.user_id);
        const stats = salesByMember.get(staff.organization_member_id) ?? {
          salesCount: 0,
          itemsSold: 0,
          totalSoldMinor: 0,
        };

        return {
          memberId: member.id,
          eventStaffId: staff.id,
          firstName: profile?.first_name?.trim() || "Bartender",
          lastName: profile?.last_name?.trim() || "",
          active: member.status === "active" && Boolean(staff.active),
          barName: staff.bar_id ? barNameById.get(staff.bar_id) ?? "Sin barra" : "Sin barra",
          salesCount: stats.salesCount,
          itemsSold: stats.itemsSold,
          totalSoldMinor: stats.totalSoldMinor,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "es");
      });

    const activeBartenders = bartenders.filter((b) => b.active).length;

    return NextResponse.json({
      ok: true,
      event: { id: event.id, name: event.name },
      bartenders,
      metrics: {
        totalBartenders: bartenders.length,
        activeBartenders,
        totalBars: bars.length,
        totalSoldMinor,
        comboValueMinor,
      },
    });
  } catch (error) {
    console.error("GET /api/stock/cobertura", error);
    return NextResponse.json({ error: "No se pudo cargar la cobertura de barras." }, { status: 500 });
  }
}

function emptyMetrics() {
  return {
    totalBartenders: 0,
    activeBartenders: 0,
    totalBars: 0,
    totalSoldMinor: 0,
    comboValueMinor: 0,
  };
}

function emptyResponse(event: { id: string; name: string } | null) {
  return {
    ok: true,
    event,
    bartenders: [] as unknown[],
    metrics: emptyMetrics(),
  };
}
