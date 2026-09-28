import { requireAdminPage } from "../../../lib/quotes/auth";
import SalesAgentDashboard from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function SalesAgentPage() {
  await requireAdminPage();
  return <SalesAgentDashboard />;
}
