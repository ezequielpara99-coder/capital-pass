import "server-only";
import { createAdminClient } from "../supabase/admin";
import { getAppBaseUrl } from "./server";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}

type OAuthTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
};

export function oauthCallbackUrl() {
  return `${getAppBaseUrl()}/api/mercadopago/oauth/callback`;
}

// Link de autorizacion que el organizador visita para conectar su propia
// cuenta de Mercado Pago (Marketplace / OAuth). El state es un token
// aleatorio de un solo uso (no el organization_id): protege contra que
// alguien arme a mano un link de callback con el "state" de otro, use un
// "code" propio, y termine conectando SU cuenta de Mercado Pago a la
// organizacion de otro organizador. Ver /api/mercadopago/oauth/start y
// /api/mercadopago/oauth/callback.
export function authorizationUrl(state: string) {
  const clientId = requiredEnv("MERCADOPAGO_CLIENT_ID");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    platform_id: "mp",
    redirect_uri: oauthCallbackUrl(),
    state,
  });
  return `https://auth.mercadopago.com.ar/authorization?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const response = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: requiredEnv("MERCADOPAGO_CLIENT_ID"),
      client_secret: requiredEnv("MERCADOPAGO_CLIENT_SECRET"),
      ...body,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`No se pudo intercambiar el token de Mercado Pago (${response.status}): ${detail}`);
  }
  return response.json() as Promise<OAuthTokenResponse>;
}

export async function connectOrganization(organizationId: string, code: string) {
  const token = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: oauthCallbackUrl(),
  });
  const admin = createAdminClient();
  const { error } = await admin.from("organization_mercadopago_accounts").upsert({
    organization_id: organizationId,
    mp_user_id: token.user_id,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("No se pudo guardar la conexion con Mercado Pago.");
}

// Devuelve un access_token valido para operar en nombre del organizador,
// refrescandolo primero si esta por vencer.
export async function accessTokenFor(organizationId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("organization_mercadopago_accounts")
    .select("access_token, refresh_token, expires_at").eq("organization_id", organizationId).maybeSingle();
  if (error) throw new Error("No se pudo consultar la conexion con Mercado Pago.");
  if (!data) return null;

  const expiresInMs = new Date(data.expires_at).getTime() - Date.now();
  if (expiresInMs > 5 * 60 * 1000) return data.access_token as string;

  const refreshed = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  const { error: updateError } = await admin.from("organization_mercadopago_accounts").update({
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("organization_id", organizationId);
  if (updateError) throw new Error("No se pudo renovar la conexion con Mercado Pago.");
  return refreshed.access_token;
}
