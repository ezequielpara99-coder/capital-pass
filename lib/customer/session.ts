import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

// Portal del cliente (/mi): no crea cuentas ni contrasenas -- el ingreso es
// por link magico mandado al email ya cargado en una compra/membresia. Dos
// tokens firmados con el mismo HMAC (mismo secret que entradas/carnet, otro
// prefijo de mensaje):
//   - "login": vive 15 minutos, viaja en el link del email, se cambia por
//     una cookie de sesion apenas se usa una vez.
//   - "session": vive 30 dias, vive en una cookie httpOnly -- es lo que
//     deja al portal ser "una app propia" y no un link de un solo uso.

const SESSION_COOKIE = "cp_customer_session";
const LOGIN_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getSigningSecret() {
  const secret = process.env.TICKET_SIGNING_SECRET;
  if (!secret) throw new Error("Falta TICKET_SIGNING_SECRET en .env.local");
  return secret;
}

function sign(message: string) {
  return createHmac("sha256", getSigningSecret()).update(message).digest("base64url");
}

function safeEqual(a: string, b: string) {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function encodeEmail(email: string) {
  return Buffer.from(email.trim().toLowerCase()).toString("base64url");
}

function decodeEmail(encoded: string) {
  try {
    return Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function createToken(kind: "login" | "session", email: string, ttlMs: number) {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${kind}:${encodeEmail(email)}:${expiresAt}`;
  const signature = sign(`capital-pass-customer:${payload}`);
  return `${payload}:${signature}`;
}

function verifyToken(kind: "login" | "session", token: string): string | null {
  const parts = token.trim().split(":");
  if (parts.length !== 4) return null;
  const [tokenKind, encodedEmail, expiresAtRaw, signature] = parts;
  if (tokenKind !== kind) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  const expected = sign(`capital-pass-customer:${tokenKind}:${encodedEmail}:${expiresAtRaw}`);
  if (!safeEqual(signature, expected)) return null;

  return decodeEmail(encodedEmail);
}

export function createLoginToken(email: string) {
  return createToken("login", email, LOGIN_TTL_MS);
}

export function verifyLoginToken(token: string) {
  return verifyToken("login", token);
}

export function createSessionToken(email: string) {
  return createToken("session", email, SESSION_TTL_MS);
}

export function verifySessionToken(token: string) {
  return verifyToken("session", token);
}

export const CUSTOMER_SESSION_COOKIE = SESSION_COOKIE;
export const CUSTOMER_SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;
