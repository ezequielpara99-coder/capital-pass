import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const endpoint = String(body.endpoint ?? "").trim();
    const p256dh = String(body.keys?.p256dh ?? "").trim();
    const authKey = String(body.keys?.auth ?? "").trim();

    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json({ error: "Falta información de la suscripción." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

    const admin = createAdminClient();
    const { error } = await admin
      .from("push_subscriptions")
      .upsert({ user_id: user.id, endpoint, p256dh, auth_key: authKey }, { onConflict: "endpoint" });

    if (error) return NextResponse.json({ error: "No se pudo activar la notificación." }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const endpoint = String(body.endpoint ?? "").trim();
    if (!endpoint) return NextResponse.json({ error: "Falta el endpoint." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay una sesión válida." }, { status: 401 });

    const admin = createAdminClient();
    await admin.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ocurrió un error inesperado." }, { status: 500 });
  }
}
