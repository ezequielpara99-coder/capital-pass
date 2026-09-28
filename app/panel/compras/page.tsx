import { requireOrganizerPage } from "../../../lib/panel/organizer-page";
import ComprasClient from "./compras-client";

export const dynamic = "force-dynamic";

export default async function ComprasPage() {
  if (!(await requireOrganizerPage())) return null;
  return <ComprasClient />;
}
