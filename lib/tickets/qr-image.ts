import "server-only";
import QRCode from "qrcode";
import { createTicketQRPayload } from "./signature";

// Mismas opciones que ya usaba app/entrada/[ticketId]/page.tsx -- se
// centralizan acá para poder generar el mismo QR tanto para la vista web
// de la entrada como para adjuntarlo a un email, sin duplicar los
// parámetros (y el comentario de por qué margin:4 importa).
export const TICKET_QR_OPTIONS = {
  width: 900,
  margin: 4,
  errorCorrectionLevel: "M" as const,
  color: {
    dark: "#050505",
    light: "#ffffff",
  },
};

export async function ticketQrPngBuffer(ticketId: string): Promise<Buffer> {
  const payload = createTicketQRPayload(ticketId);
  return QRCode.toBuffer(payload, TICKET_QR_OPTIONS);
}
