import "server-only";
import QRCode from "qrcode";
import { createMemberQRPayload } from "./signature";

export const MEMBER_QR_OPTIONS = {
  width: 900,
  margin: 4,
  errorCorrectionLevel: "M" as const,
  color: { dark: "#050505", light: "#ffffff" },
};

export async function memberQrPngBuffer(memberId: string): Promise<Buffer> {
  const payload = createMemberQRPayload(memberId);
  return QRCode.toBuffer(payload, MEMBER_QR_OPTIONS);
}
