import "server-only";

import {
  createHmac,
  timingSafeEqual,
} from "crypto";

function getSigningSecret() {
  const secret =
    process.env.TICKET_SIGNING_SECRET;

  if (!secret) {
    throw new Error(
      "Falta TICKET_SIGNING_SECRET en .env.local"
    );
  }

  return secret;
}

export function createTicketSignature(
  ticketId: string
) {
  return createHmac(
    "sha256",
    getSigningSecret()
  )
    .update(`capital-pass-ticket:${ticketId}`)
    .digest("base64url");
}

export function verifyTicketSignature(
  ticketId: string,
  signature: string
) {
  try {
    const expected =
      createTicketSignature(ticketId);

    const receivedBuffer =
      Buffer.from(signature);

    const expectedBuffer =
      Buffer.from(expected);

    if (
      receivedBuffer.length !==
      expectedBuffer.length
    ) {
      return false;
    }

    return timingSafeEqual(
      receivedBuffer,
      expectedBuffer
    );
  } catch {
    return false;
  }
}

export function createTicketQRPayload(
  ticketId: string
) {
  const signature =
    createTicketSignature(ticketId);

  return `CP1:${ticketId}:${signature}`;
}

export function createTicketPublicPath(
  ticketId: string
) {
  const signature =
    createTicketSignature(ticketId);

  return `/entrada/${ticketId}?s=${encodeURIComponent(
    signature
  )}`;
}