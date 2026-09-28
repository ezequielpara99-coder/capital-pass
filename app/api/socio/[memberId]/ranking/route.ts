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

    // Ganadores del ultimo mes cerrado (solo nombre con inicial y premio).
    let lastWinners: { period: string; position: number; name: string; prize: string }[] = [];
    const { data: me } = await admin.from("premium_members").select("organization_id").eq("id", memberId).maybeSingle();
    if (me && (data as { enabled?: boolean } | null)?.enabled) {
      const { data: latest } = await admin
        .from("member_monthly_winners")
        .select("period")
        .eq("organization_id", me.organization_id)
        .order("period", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest) {
        const { data: rows } = await admin
          .from("member_monthly_winners")
          .select("period, position, prize, member_id")
          .eq("organization_id", me.organization_id)
          .eq("period", latest.period)
          .order("position", { ascending: true });
        const ids = (rows ?? []).map((r) => r.member_id as string);
        const { data: people } = ids.length ? await admin.from("premium_members").select("id, first_name, last_name").in("id", ids) : { data: [] };
        const names = new Map((people ?? []).map((p) => [p.id as string, `${p.first_name} ${String(p.last_name).slice(0, 1)}.`]));
        lastWinners = (rows ?? []).map((r) => ({ period: r.period as string, position: Number(r.position), name: names.get(r.member_id as string) ?? "Socio", prize: r.prize as string }));
      }
    }

    return NextResponse.json({ ok: true, period, ranking: data, lastWinners });
  } catch (error) {
    console.error("SOCIO RANKING:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
