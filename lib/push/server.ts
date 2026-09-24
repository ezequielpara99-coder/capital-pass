import "server-only";
import webpush from "web-push";
import { createAdminClient } from "../supabase/admin";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

type PushPayload = { title: string; body: string; url?: string };

// Manda un push a todas las suscripciones (dispositivos) de un usuario.
// Si Web Push devuelve que la suscripcion ya no es valida (410/404), la
// borramos -- asi no se acumulan suscripciones muertas de celulares donde
// se desinstalo la app.
async function sendToSubscriptions(
  subs: { id: string; endpoint: string; p256dh: string; auth_key: string }[],
  payload: PushPayload
) {
  ensureConfigured();
  if (!configured || subs.length === 0) return;

  const admin = createAdminClient();
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          JSON.stringify(payload)
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number })?.statusCode;
        // Solo 404/410 significan sin ambiguedad "esta suscripcion puntual
        // ya no existe" (se desinstalo la app en ESE dispositivo) -- ahi si
        // se borra, para no acumular suscripciones muertas para siempre.
        // 400/403 NO se borran mas: antes se trataban igual que 404/410,
        // pero 403 en particular tambien lo devuelve el proveedor cuando
        // las credenciales VAPID del SERVIDOR estan desincronizadas (ej. se
        // roto VAPID_PRIVATE_KEY sin actualizar la publica) -- en ese caso
        // TODAS las suscripciones fallan con 403 al mismo tiempo, y
        // borrarlas de una hubiera vaciado la base entera de suscripciones
        // push por un problema de configuracion, no de los dispositivos.
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          // Solo el codigo/mensaje: el objeto completo del error incluye el
          // endpoint de la suscripcion, que funciona como identificador del
          // dispositivo de una persona real -- no hace falta en los logs.
          const message = error instanceof Error ? error.message : String(error);
          console.error("PUSH: no se pudo enviar la notificación.", { statusCode, message });
        }
      }
    })
  );
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", userId);
  await sendToSubscriptions(subs ?? [], payload);
}

// Manda a todos los organizadores activos de una organizacion, respetando
// las preferencias de cada uno (si tiene ese tipo de aviso desactivado, no
// le llega).
export async function sendPushToOrganizers(
  organizationId: string,
  kind: "bar_sale" | "low_stock",
  payload: PushPayload
) {
  const admin = createAdminClient();

  const { data: members } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", "organizer")
    .eq("status", "active");

  const userIds = (members ?? []).map((m) => m.user_id);
  if (userIds.length === 0) return;

  const { data: settings } = await admin
    .from("notification_settings")
    .select("user_id, bar_sale_alerts, low_stock_alerts")
    .in("user_id", userIds);

  const settingsByUserId = new Map((settings ?? []).map((s) => [s.user_id, s]));
  const settingField = kind === "bar_sale" ? "bar_sale_alerts" : "low_stock_alerts";

  const eligibleUserIds = userIds.filter((id) => {
    const pref = settingsByUserId.get(id);
    // Sin fila de preferencias todavia = valores por defecto (todo activado).
    return pref ? pref[settingField] : true;
  });
  if (eligibleUserIds.length === 0) return;

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key, user_id")
    .in("user_id", eligibleUserIds);

  await sendToSubscriptions(subs ?? [], payload);
}

// Manda a todos los admins de la plataforma (ej: aviso de nueva suscripcion).
export async function sendPushToPlatformAdmins(payload: PushPayload) {
  const admin = createAdminClient();

  const { data: admins } = await admin.from("platform_admins").select("user_id");
  const userIds = (admins ?? []).map((a) => a.user_id);
  if (userIds.length === 0) return;

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .in("user_id", userIds);

  await sendToSubscriptions(subs ?? [], payload);
}
