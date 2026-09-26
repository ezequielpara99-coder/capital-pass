import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

// Mismo mecanismo que lib/tickets/signature.ts (HMAC con el mismo secret,
// prefijo de mensaje distinto para que un QR de socio nunca pueda pasar
// como firma valida de una entrada, ni al reves).
function getSigningSecret() {
  const secret = process.env.TICKET_SIGNING_SECRET;
  if (!secret) throw new Error("Falta TICKET_SIGNING_SECRET en .env.local");
  return secret;
}

export function createMemberSignature(memberId: string) {
  return createHmac("sha256", getSigningSecret())
    .update(`capital-pass-member:${memberId}`)
    .digest("base64url");
}

export function verifyMemberSignature(memberId: string, signature: string) {
  try {
    const expected = createMemberSignature(memberId);
    const receivedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (receivedBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(receivedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export function createMemberQRPayload(memberId: string) {
  return `CPM1:${memberId}:${createMemberSignature(memberId)}`;
}

export function createMemberPublicPath(memberId: string) {
  return `/socio/${memberId}?s=${encodeURIComponent(createMemberSignature(memberId))}`;
}
