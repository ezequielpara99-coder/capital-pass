import { requireAdminPage } from "../../../../lib/quotes/auth";
import CampanasClient from "./campanas-client";

export const dynamic = "force-dynamic";

export default async function CampanasPage() {
  await requireAdminPage();
  return <CampanasClient />;
}
