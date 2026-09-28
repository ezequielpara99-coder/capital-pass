import { requireAdminPage } from "../../../../../lib/quotes/auth";
import NuevaCampanaClient from "./nueva-campana-client";

export const dynamic = "force-dynamic";

export default async function NuevaCampanaPage() {
  await requireAdminPage();
  return <NuevaCampanaClient />;
}
