// Parseo del payload del QR de una entrada ("CP1:<ticketId>:<firma>").
// A diferencia de lib/tickets/signature.ts (que SI tiene "server-only"
// porque calcula/verifica la firma con un secret que nunca sale del
// servidor), esto es solo el parseo del texto -- se usa tanto en el
// servidor (app/api/control/validar-qr/route.ts, que despues SI
// verifica la firma) como en el cliente (app/control/page.tsx, para el
// modo offline: sin conexion no se puede verificar la firma, pero si
// se puede sacar el ticketId para buscarlo en el cache local).
export type QRPayloadResult =
  | { ok: true; ticketId: string; signature: string }
  | { ok: false };

export function parseQRPayload(value: string): QRPayloadResult {
  const trimmed = value.trim();
  const parts = trimmed.split(":");

  if (parts.length !== 3) {
    return { ok: false };
  }

  const [version, ticketId, signature] = parts;

  if (version !== "CP1") {
    return { ok: false };
  }

  if (!ticketId || !signature) {
    return { ok: false };
  }

  return { ok: true, ticketId, signature };
}
