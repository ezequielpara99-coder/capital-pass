import { NextRequest, NextResponse, after } from "next/server";
import { isMissingTable, resolveOrganizer, UUID_RE } from "../../../../lib/panel/organizer";
import { sendPushToMember } from "../../../../lib/push/server";
import { createMemberPublicPath } from "../../../../lib/members/signature";

const MISSING = "Falta aplicar la actualizaciÃ³n de la base de datos de la app del socio (20260982).";
const BUSINESS_ERRORS = /ya esta listo|ya esta cerrado|Estado invalido|no existe|permiso/i;

// GET: pedidos de los socios. ?scope=open (default: pendientes y listos) | all (ultimos 100).
export async function GET(request: NextRequest) {
  try {
    const caller = await resolveOrganizer({ requirePremium: true, roles: ["organizer", "bartender"] });
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const scope = request.nextUrl.searchParams.get("scope") === "all" ? "all" : "open";

    let query = caller.admin
      .from("member_orders")
      .select("id, member_id, kind, items, total_minor, points_earned, points_cost, payment, delivery, note, status, pickup_code, created_at")
      .eq("organization_id", caller.organizationId)
      .order("created_at", { ascending: scope === "open" })
      .limit(100);
    if (scope === "open") query = query.in("status", ["pending", "ready"]);

    const { data, error } = await query;
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: MISSING }, { status: 503 });
      console.error("MEMBRESIA PEDIDOS GET:", error);
      return NextResponse.json({ error: "No se pudieron cargar los pedidos." }, { status: 500 });
    }

    const memberIds = [...new Set((data ?? []).map((o) => o.member_id as string))];
    const names = new Map<string, string>();
    if (memberIds.length > 0) {
      const { data: members } = await caller.admin.from("premium_members").select("id, first_name, last_name, member_code").in("id", memberIds);
      for (const m of members ?? []) names.set(m.id as string, `${m.first_name} ${m.last_name} Â· ${m.member_code}`);
    }

    return NextResponse.json({
      ok: true,
      orders: (data ?? []).map((o) => ({ ...o, total_minor: Number(o.total_minor), memberName: names.get(o.member_id as string) ?? "Socio" })),
    });
  } catch {
    return NextResponse.json({ error: "OcurriÃ³ un error inesperado." }, { status: 500 });
  }
}

// PATCH: cambia el estado de un pedido { id, status: ready | delivered | cancelled }.
export async function PATCH(request: NextRequest) {
  try {
    const caller = await resolveOrganizer({ requirePremium: true, roles: ["organizer", "bartender"] });
    if ("error" in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const body = await request.json();
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    if (!UUID_RE.test(id) || !["ready", "delivered", "cancelled"].includes(status)) {
      return NextResponse.json({ error: "Datos invÃ¡lidos." }, { status: 400 });
    }

    const { error } = await caller.admin.rpc("member_order_set_status", {
      p_order_id: id,
      p_status: status,
      p_organization_id: caller.organizationId,
      p_member_id: null,
    });

    if (error) {
      const message = error.message ?? "";
      if (BUSINESS_ERRORS.test(message)) return NextResponse.json({ error: message }, { status: 400 });
      console.error("MEMBRESIA PEDIDOS PATCH:", error);
      return NextResponse.json({ error: "No se pudo actualizar el pedido." }, { status: 500 });
    }

    // Aviso al celular del socio (despues de responder: el bartender no espera).
    after(async () => {
      try {
        const { data: order } = await caller.admin
          .from("member_orders")
          .select("member_id, pickup_code, delivery, payment, total_minor, points_earned, points_cost")
          .eq("id", id)
          .eq("organization_id", caller.organizationId)
          .maybeSingle();
        if (!order) return;

        const url = `${createMemberPublicPath(order.member_id as string)}&tab=pedidos`;
        const code = order.pickup_code as string;
        const toTable = String(order.delivery ?? "").startsWith("Mesa");

        if (status === "ready") {
          await sendPushToMember(order.member_id as string, {
            title: "Tu pedido estÃ¡ listo",
            body: toTable ? `Pedido ${code}. Te lo estÃ¡n llevando a tu mesa.` : `Pedido ${code}. Retiralo en la barra.`,
            url,
          });
        } else if (status === "delivered" && Number(order.points_earned) > 0) {
          await sendPushToMember(order.member_id as string, {
            title: `Sumaste ${order.points_earned} puntos`,
            body: `Gracias por tu pedido ${code}.`,
            url,
          });
        } else if (status === "cancelled") {
          const refunded = (order.payment === "wallet" && Number(order.total_minor) > 0) || Number(order.points_cost) > 0;
          await sendPushToMember(order.member_id as string, {
            title: "Cancelaron tu pedido",
            body: refunded ? `Pedido ${code}. Te devolvimos el saldo y los puntos.` : `Pedido ${code}.`,
            url,
          });
        }
      } catch (err) {
        console.error("AVISO PEDIDO:", err instanceof Error ? err.message : err);
      }
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "OcurriÃ³ un error inesperado." }, { status: 500 });
  }
}

