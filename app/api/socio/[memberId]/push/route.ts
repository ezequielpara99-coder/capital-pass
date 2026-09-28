import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { verifySessionToken, CUSTOMER_SESSION_COOKIE } from "../../../../../lib/customer/session";
import { verifyMemberSignature } from "../../../../../lib/members/signature";
import { checkRateLimit, getClientIp } from "../../../../../lib/http/rate-limit";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ memberId: string }> };

const MAX_DEVICES = 5;

async function authorize(request: NextRequest, memberId: string) {
  const signature = request.nextUrl.searchParams.get("s") ?? "";
  if (!signature || !verifyMemberSignature(memberId, signature)) {
    return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  }
  if (!(await checkRateLimit(`socio-push:${getClientIp(request)}`, 20, 60))) {
    return NextResponse.json({ error: "Demasiados intentos, esperá un momento." }, { status: 429 });
  }
  return null;
}

// POST { endpoint, keys }: activa los avisos en este celular (con sesion por
// email, ver abajo). Si el mismo dispositivo ya estaba suscripto a otro socio
// (celular compartido), pasa a este: un dispositivo recibe los avisos de una
// sola persona a la vez.
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { memberId } = await context.params;
    const denied = await authorize(request, memberId);
    if (denied) return denied;

    const body = await request.json();
    const endpoint = String(body.endpoint ?? "");
    const p256dh = String(body.keys?.p256dh ?? "");
    const authKey = String(body.keys?.auth ?? "");
    if (!/^https:\/\/[^\s]{10,1000}$/.test(endpoint) || !p256dh || !authKey || p256dh.length > 200 || authKey.length > 100) {
      return NextResponse.json({ error: "Suscripción inválida." }, { status: 400 });
    }

    // Activar avisos exige haber iniciado sesion con el email del socio (link
    // magico por email, el mismo ingreso de /mi): el link del carnet solo no
    // alcanza, porque cualquiera que lo tenga podria recibir sus avisos.
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value ?? "";
    const sessionEmail = sessionCookie ? verifySessionToken(sessionCookie) : null;
    if (!sessionEmail) return NextResponse.json({ error: "Ingresá con tu email para activar los avisos.", code: "login" }, { status: 401 });

    const admin = createAdminClient();
    const { data: member } = await admin.from("premium_members").select("id, email").eq("id", memberId).is("deleted_at", null).maybeSingle();
    if (!member) return NextResponse.json({ error: "Socio no encontrado." }, { status: 404 });
    if (!member.email || member.email.trim().toLowerCase() !== sessionEmail.trim().toLowerCase()) {
      return NextResponse.json({ error: "Ese email no es el de esta membresía.", code: "mismatch" }, { status: 403 });
    }

    const { error } = await admin
      .from("member_push_subscriptions")
      .upsert({ member_id: memberId, endpoint, p256dh, auth_key: authKey }, { onConflict: "endpoint" });
    if (error) {
      if (/does not exist|schema cache/i.test(error.message ?? "")) {
        return NextResponse.json({ error: "Los avisos todavía no están disponibles." }, { status: 503 });
      }
      console.error("SOCIO PUSH:", error);
      return NextResponse.json({ error: "No se pudieron activar los avisos." }, { status: 500 });
    }

    // Tope de dispositivos por socio: se borran los mas viejos.
    const { data: all } = await admin
      .from("member_push_subscriptions")
      .select("id")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false });
    const extra = (all ?? []).slice(MAX_DEVICES).map((s) => s.id as string);
    if (extra.length > 0) await admin.from("member_push_subscriptions").delete().in("id", extra);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("SOCIO PUSH:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

// DELETE { endpoint }: desactiva los avisos en este celular.
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { memberId } = await context.params;
    const denied = await authorize(request, memberId);
    if (denied) return denied;

    const body = await request.json();
    const endpoint = String(body.endpoint ?? "");
    if (!endpoint) return NextResponse.json({ error: "Suscripción inválida." }, { status: 400 });

    const admin = createAdminClient();
    await admin.from("member_push_subscriptions").delete().eq("member_id", memberId).eq("endpoint", endpoint);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("SOCIO PUSH:", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
