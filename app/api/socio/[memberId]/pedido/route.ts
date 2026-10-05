import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { sendPushToOrganizers } from "../../../../../lib/push/server";
import { memberSessionStatus, SESSION_MESSAGES } from "../../../../../lib/customer/member-auth";
import { verifyMemberSignature } from "../../../../../lib/members/signature";
import { checkRateLimit, getClientIp } from "../../../../../lib/http/rate-limit";
import { UUID_RE } from "../../../../../lib/panel/organizer";

type RouteContext = { params: Promise<{ memberId: string }> };

// Mensajes de negocio que levantan las funciones SQL: se muestran tal cual
// al socio. Cualquier otro error se loguea y devuelve un mensaje generico.
const BUSINESS_ERRORS = /Saldo insuficiente|No te alcanzan|membresia|ya no esta disponible|ya no admite|pedido esta vac|Demasiados|Cantidad invalida|Elegi una mesa|mesa no existe|Solo podes cancelar|ya esta cerrado/i;

async function authorize(request: NextRequest, memberId: string) {
  const signature = request.nextUrl.searchParams.get("s") ?? "";
  if (!signature || !verifyMemberSignature(memberId, signature)) {
    return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  }
  if (!(await checkRateLimit(`socio-pedido:${getClientIp(request)}`, 30, 60))) {
    return NextResponse.json({ error: "Demasiados intentos, esperá un momento." }, { status: 429 });
  }
  return null;
}

function friendly(message: string) {
  return BUSINESS_ERRORS.test(message) ? message : "No se pudo completar el pedido.";
}

// POST: el socio hace un pedido (consumo o reserva de mesa).
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { memberId } = await context.params;
    const denied = await authorize(request, memberId);
    if (denied) return denied;

    const body = await request.json();
    const kind = body.kind === "mesa" ? "mesa" : "consumo";
    const payment = body.payment === "wallet" ? "wallet" : "en_barra";
    const tableId = body.tableId ? String(body.tableId) : null;
    if (tableId && !UUID_RE.test(tableId)) return NextResponse.json({ error: "Mesa inválida." }, { status: 400 });

    const items = Array.isArray(body.items)
      ? body.items
          .map((i: { id?: unknown; qty?: unknown }) => ({ id: String(i.id ?? ""), qty: Math.floor(Number(i.qty)) }))
          .filter((i: { id: string; qty: number }) => UUID_RE.test(i.id) && Number.isFinite(i.qty) && i.qty > 0)
      : [];
    if (kind === "consumo" && items.length === 0) return NextResponse.json({ error: "El pedido está vacío." }, { status: 400 });

    const key = String(body.key ?? "").trim().slice(0, 80) || null;
    if (!key) return NextResponse.json({ error: "Falta la clave del pedido." }, { status: 400 });

    const admin = createAdminClient();

    // Pagar con saldo mueve plata, y canjear premios gasta los puntos del
    // socio: no alcanza con tener el link del carnet (es el mismo dato que
    // va en el QR que se muestra en la puerta), hay que haber ingresado con
    // el email de la membresia.
    let spendsPoints = false;
    if (payment !== "wallet" && items.length > 0) {
      const { data: prizes } = await admin
        .from("member_menu_items")
        .select("id")
        .in("id", items.map((i: { id: string }) => i.id))
        .eq("kind", "premio")
        .limit(1);
      spendsPoints = (prizes?.length ?? 0) > 0;
    }
    if (payment === "wallet" || spendsPoints) {
      const { data: owner } = await admin.from("premium_members").select("email").eq("id", memberId).is("deleted_at", null).maybeSingle();
      const session = await memberSessionStatus((owner?.email as string | null) ?? null);
      if (session !== "ready") {
        const problem = SESSION_MESSAGES[session];
        return NextResponse.json({ error: problem.error, code: session }, { status: problem.status });
      }
    }
    const { data, error } = await admin.rpc("member_place_order", {
      p_member_id: memberId,
      p_kind: kind,
      p_items: items,
      p_payment: payment,
      p_table_id: tableId,
      p_note: String(body.note ?? "").slice(0, 300) || null,
      p_key: key,
      p_delivery: String(body.delivery ?? "").slice(0, 80) || null,
    });

    if (error) {
      const message = error.message ?? "";
      if (!BUSINESS_ERRORS.test(message)) console.error("SOCIO PEDIDO:", error);
      return NextResponse.json({ error: friendly(message) }, { status: 400 });
    }

    const row = (data ?? [])[0];

    // Aviso al organizador: nuevo pedido de un socio (respeta su preferencia
    // de avisos de barra). Despues de responder, para no demorar al socio.
    if (row && !row.already_existed) {
      after(async () => {
        try {
          const { data: member } = await admin.from("premium_members").select("organization_id, first_name, last_name").eq("id", memberId).maybeSingle();
          if (!member) return;
          const who = `${member.first_name} ${String(member.last_name).slice(0, 1)}.`;
          const count = items.reduce((sum: number, i: { qty: number }) => sum + i.qty, 0);
          await sendPushToOrganizers(member.organization_id as string, "bar_sale", {
            title: kind === "mesa" ? "Nueva reserva de mesa" : "Nuevo pedido de un socio",
            body:
              kind === "mesa"
                ? `${who} reservó una mesa.`
                : `${who}: ${count} ${count === 1 ? "producto" : "productos"}${body.delivery ? ` · ${String(body.delivery).slice(0, 40)}` : ""}.`,
            url: "/panel/membresia/pedidos",
          });
        } catch (err) {
          console.error("AVISO PEDIDO NUEVO:", err instanceof Error ? err.message : err);
        }
      });
    }

    return NextResponse.json({
      ok: true,
      orderId: row?.order_id,
      pickupCode: row?.pickup_code,
      totalMinor: Number(row?.total_minor ?? 0),
      balanceMinor: Number(row?.balance_minor ?? 0),
      pointsBalance: Number(row?.points_balance ?? 0),
      alreadyExisted: Boolean(row?.already_existed),
    });
  } catch (error) {
    console.error("SOCIO PEDIDO:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// PATCH: el socio cancela un pedido que todavia no esta listo (reembolsa
// saldo/puntos y libera la mesa).
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { memberId } = await context.params;
    const denied = await authorize(request, memberId);
    if (denied) return denied;

    const body = await request.json();
    const orderId = String(body.orderId ?? "");
    if (!UUID_RE.test(orderId)) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

    const admin = createAdminClient();

    // Cancelar mueve plata (reembolsa saldo/puntos) y libera una mesa que se
    // pago: el link firmado del carnet no alcanza, igual que para pagar con
    // saldo -- hace falta haber ingresado con el email de la membresia.
    const { data: owner } = await admin.from("premium_members").select("email").eq("id", memberId).is("deleted_at", null).maybeSingle();
    const session = await memberSessionStatus((owner?.email as string | null) ?? null);
    if (session !== "ready") {
      const problem = SESSION_MESSAGES[session];
      return NextResponse.json({ error: problem.error, code: session }, { status: problem.status });
    }

    const { error } = await admin.rpc("member_order_set_status", {
      p_order_id: orderId,
      p_status: "cancelled",
      p_organization_id: null,
      p_member_id: memberId,
    });

    if (error) {
      const message = error.message ?? "";
      if (!BUSINESS_ERRORS.test(message)) console.error("SOCIO CANCELAR:", error);
      return NextResponse.json({ error: friendly(message) }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("SOCIO CANCELAR:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
