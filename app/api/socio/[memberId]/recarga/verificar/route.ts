import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { reconcileTopup } from "../../../../../../lib/billing/server";
import { verifyMemberSignature } from "../../../../../../lib/members/signature";
import { checkRateLimit, getClientIp } from "../../../../../../lib/http/rate-limit";
import { UUID_RE } from "../../../../../../lib/panel/organizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ memberId: string }> };

// POST { topupId }: el socio vuelve de Mercado Pago y su app pregunta si la
// recarga ya se acreditó. Reconcilia contra Mercado Pago (por si el webhook
// todavía no llegó) y devuelve el estado real de la recarga.
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { memberId } = await context.params;
    const signature = request.nextUrl.searchParams.get("s") ?? "";
    if (!signature || !verifyMemberSignature(memberId, signature)) {
      return NextResponse.json({ error: "Link inválido." }, { status: 404 });
    }
    if (!(await checkRateLimit(`topup-verify:${getClientIp(request)}`, 30, 60))) {
      return NextResponse.json({ error: "Demasiados intentos, esperá un momento." }, { status: 429 });
    }

    const body = await request.json();
    const topupId = String(body.topupId ?? "");
    if (!UUID_RE.test(topupId)) return NextResponse.json({ error: "Recarga inválida." }, { status: 400 });

    const admin = createAdminClient();
    const { data: topup } = await admin.from("wallet_topups").select("id, member_id, status").eq("id", topupId).maybeSingle();
    if (!topup || topup.member_id !== memberId) return NextResponse.json({ error: "Recarga no encontrada." }, { status: 404 });

    if (topup.status === "pending" || topup.status === "rejected") {
      try {
        await reconcileTopup(topupId);
      } catch (error) {
        console.error("RECARGA: no se pudo reconciliar.", error);
      }
    }

    const { data: current } = await admin.from("wallet_topups").select("status, amount_minor").eq("id", topupId).maybeSingle();
    return NextResponse.json({ ok: true, status: current?.status ?? topup.status, amountMinor: Number(current?.amount_minor ?? 0) });
  } catch (error) {
    console.error("RECARGA VERIFICAR:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
