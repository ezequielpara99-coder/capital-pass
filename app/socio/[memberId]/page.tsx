import QRCode from "qrcode";
import { notFound } from "next/navigation";

import { createAdminClient } from "../../../lib/supabase/admin";
import { createMemberQRPayload, verifyMemberSignature } from "../../../lib/members/signature";
import { MEMBER_QR_OPTIONS } from "../../../lib/members/qr-image";
import SocioApp from "./socio-app";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<{ s?: string | string[] }>;
};

// La "app" del socio: carnet con QR + carta, mesas, pedidos y puntos del
// boliche. El QR se genera en el servidor; todo lo demas lo carga el cliente
// desde /api/socio/[memberId] con la misma firma del link.
export default async function SocioPage({ params, searchParams }: PageProps) {
  const { memberId } = await params;
  const { s } = await searchParams;
  const signature = Array.isArray(s) ? s[0] : s;

  if (!signature || !verifyMemberSignature(memberId, signature)) notFound();

  const admin = createAdminClient();
  const { data: member } = await admin.from("premium_members").select("id").eq("id", memberId).is("deleted_at", null).maybeSingle();
  if (!member) notFound();

  const qrDataUrl = await QRCode.toDataURL(createMemberQRPayload(member.id), MEMBER_QR_OPTIONS);

  return <SocioApp memberId={member.id} signature={signature} qrDataUrl={qrDataUrl} />;
}
