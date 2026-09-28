import { requireAdminPage } from "../../../../lib/quotes/auth";
import ProspectosClient from "./prospectos-client";

export const dynamic = "force-dynamic";

export default async function ProspectosPage() {
  await requireAdminPage();
  return <ProspectosClient />;
}
