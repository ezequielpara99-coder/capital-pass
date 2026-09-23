import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";

// Hosts reales de los servicios de push de cada navegador. El endpoint que
// manda el cliente no se validaba antes de guardarlo: cualquier usuario
// logueado (aunque sea bartender/rrpp/puerta) podia mandar un endpoint
// propio apuntando a un host interno o a un servidor suyo. Cuando se
// dispara un push hacia ese usuario, el servidor le hace un POST directo a
// esa URL (web-push -> https.request), es decir SSRF saliente controlado
// por el atacante -- por eso el endpoint solo se acepta si es HTTPS y su
// host termina en uno de los proveedores reales de push.
const ALLOWED_PUSH_ENDPOINT_SUFFIXES = [
  ".googleapis.com",
  ".push.services.mozilla.com",
  ".notify.windows.com",
  ".push.apple.com",
];

function isValidPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return ALLOWED_PUSH_ENDPOINT_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
}

// Las claves VAPID son base64url; p256dh (una clave publica EC sin
// comprimir) y auth (un secreto de 16 bytes) tienen un largo acotado y
// conocido -- esto no valida el contenido criptografico exacto, pero
// descarta cualquier basura obvia antes de guardarla.
const BASE64URL_KEY = /^[A-Za-z0-9_-]{20,120}$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const endpoint = String(body.endpoint ?? "").trim();
    const p256dh = String(body.keys?.p256dh ?? "").trim();
    const authKey = String(body.keys?.auth ?? "").trim();

    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json({ error: "Falta información de la suscripción." }, { status: 400 });
    }

    if (!isValidPushEndpoint(endpoint)) {
      return NextResponse.json({ error: "El endpoint de notificaciones no es válido." }, { status: 400 });
    }

    if (!BASE64URL_KEY.test(p256dh) || !BASE64URL_KEY.test(authKey)) {
      return NextResponse.json({ error: "Las claves de la suscripción no son válidas." }, { status: 400 });
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
