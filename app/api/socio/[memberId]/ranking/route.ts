import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { verifyMemberSignature } from "../../../../../lib/members/signature";
import { checkRateLimit, getClientIp } from "../../../../../lib/http/rate-limit";
import { periodStart } from "../../../../../lib/panel/period";

type RouteContext = { params: Promise<{ memberId: string }> };

// Tabla de posiciones de los socios del mismo boliche, por puntos ganados.
// ?period=month (default) | all. Solo expone nombre + inicial y puntos.
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { memberId } = await context.params;
    const signature = request.nextUrl.searchParams.get("s") ?? "";
    if (!signature || !verifyMemberSignature(memberId, signature)) {
      return NextResponse.json({ error: "Link inválido." }, { status: 404 });
    }
    if (!(await checkRateLimit(`socio-ranking:${getClientIp(request)}`, 60, 60))) {
      return NextResponse.json({ error: "Demasiados intentos, esperá un momento." }, { status: 429 });
    }

    const period = request.nextUrl.searchParams.get("period") === "all" ? "all" : "month";
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("member_ranking", { p_member_id: memberId, p_since: periodStart(period).toISOString() });

    if (error) {
      if (/member_ranking|schema cache|does not exist/i.test(error.message ?? "")) {
        return NextResponse.json({ error: "El ranking todavía no está disponible." }, { status: 503 });
      }
      console.error("SOCIO RANKING:", error);
      return NextResponse.json({ error: "No se pudo cargar el ranking." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, period, ranking: data });
  } catch (error) {
    console.error("SOCIO RANKING:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
