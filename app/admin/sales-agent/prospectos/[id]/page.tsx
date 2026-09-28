import { requireAdminPage } from "../../../../../lib/quotes/auth";
import ProspectoClient from "./prospecto-client";

export const dynamic = "force-dynamic";

export default async function ProspectoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  return <ProspectoClient id={id} />;
}
