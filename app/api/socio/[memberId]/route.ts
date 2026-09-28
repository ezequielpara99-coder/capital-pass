import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { verifyMemberSignature } from "../../../../lib/members/signature";
import { checkRateLimit, getClientIp } from "../../../../lib/http/rate-limit";
import { isMissingTable } from "../../../../lib/panel/organizer";

type RouteContext = { params: Promise<{ memberId: string }> };

// Datos de la "app" del socio: carta, mesas disponibles, pedidos y puntos.
// El link firmado del carnet (?s=) es la credencial -- mismo criterio que la
// pagina /socio/[memberId].
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { memberId } = await context.params;
    const signature = request.nextUrl.searchParams.get("s") ?? "";
    if (!signature || !verifyMemberSignature(memberId, signature)) {
      return NextResponse.json({ error: "Link inválido." }, { status: 404 });
    }

    if (!(await checkRateLimit(`socio-get:${getClientIp(request)}`, 90, 60))) {
      return NextResponse.json({ error: "Demasiados intentos, esperá un momento." }, { status: 429 });
    }

    const admin = createAdminClient();
    const { data: member, error: memberError } = await admin
      .from("premium_members")
      .select("id, organization_id, first_name, last_name, member_code, status, expires_at, balance_minor, points_balance")
      .eq("id", memberId)
      .is("deleted_at", null)
      .maybeSingle();

    if (memberError) {
      if (isMissingTable(memberError)) return NextResponse.json({ error: "La app del socio todavía no está disponible." }, { status: 503 });
      console.error("SOCIO GET:", memberError);
      return NextResponse.json({ error: "No se pudo cargar." }, { status: 500 });
    }
    if (!member) return NextResponse.json({ error: "Socio no encontrado." }, { status: 404 });

    const orgId = member.organization_id as string;

    // Premios del ranking mensual que ya gano este socio (tolerante: si la
    // tabla todavia no existe, simplemente no hay premios que mostrar).
    const prizesRes = await admin
      .from("member_monthly_winners")
      .select("id, period, position, prize, claimed_at")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(6);

    const [menuRes, ordersRes, pointsRes, eventsRes, orgRes] = await Promise.all([
      admin
        .from("member_menu_items")
        .select("id, kind, name, description, price_minor, points_earned, points_cost")
        .eq("organization_id", orgId)
        .eq("active", true)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(200),
      admin
        .from("member_orders")
        .select("id, kind, items, total_minor, points_cost, points_earned, payment, delivery, status, pickup_code, created_at")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(30),
      admin
        .from("member_points_transactions")
        .select("id, delta, reason, created_at")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(20),
      admin
        .from("events")
        .select("id, name, starts_at, status")
        .eq("organization_id", orgId)
        .in("status", ["upcoming", "active"])
        .order("starts_at", { ascending: true })
        .limit(6),
      admin.from("organizations").select("name, member_checkin_points").eq("id", orgId).maybeSingle(),
    ]);

    if (menuRes.error && isMissingTable(menuRes.error)) {
      return NextResponse.json({ error: "La app del socio todavía no está disponible." }, { status: 503 });
    }

    // Las recargas online se habilitan solas si el organizador conecto su
    // cuenta de Mercado Pago (la misma que usa para vender entradas).
    const { data: mpAccount } = await admin.from("organization_mercadopago_accounts").select("organization_id").eq("organization_id", orgId).maybeSingle();

    // Mesas disponibles de cada evento proximo.
    const events = (eventsRes.data ?? []) as { id: string; name: string; starts_at: string | null; status: string }[];
    let tables: { id: string; event_id: string; name: string; capacity: number | null; price_minor: number | null }[] = [];
    if (events.length > 0) {
      const { data: tableRows } = await admin
        .from("bar_tables")
        .select("id, event_id, name, capacity, price_minor")
        .in("event_id", events.map((e) => e.id))
        .eq("status", "available")
        .order("name", { ascending: true })
        .limit(300);
      tables = (tableRows ?? []).map((t) => ({ ...t, price_minor: t.price_minor === null ? null : Number(t.price_minor) }));
    }

    return NextResponse.json({
      ok: true,
      member: {
        firstName: member.first_name,
        lastName: member.last_name,
        code: member.member_code,
        status: member.status,
        expiresAt: member.expires_at,
        balanceMinor: Number(member.balance_minor),
        pointsBalance: Number(member.points_balance),
      },
      organization: { name: orgRes.data?.name ?? "Capital Pass", checkinPoints: Number(orgRes.data?.member_checkin_points ?? 0), topupsEnabled: Boolean(mpAccount) },
      menu: (menuRes.data ?? []).map((m) => ({ ...m, price_minor: Number(m.price_minor) })),
      events: events.map((e) => ({ ...e, tables: tables.filter((t) => t.event_id === e.id) })),
      orders: (ordersRes.data ?? []).map((o) => ({ ...o, total_minor: Number(o.total_minor) })),
      points: pointsRes.data ?? [],
      wonPrizes: prizesRes.error ? [] : prizesRes.data ?? [],
    });
  } catch (error) {
    console.error("SOCIO GET:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
