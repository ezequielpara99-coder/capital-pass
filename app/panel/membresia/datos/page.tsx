import { requireOrganizerPage } from "../../../../lib/panel/organizer-page";
import DatosClient from "./datos-client";

export const dynamic = "force-dynamic";

export default async function DatosPage() {
  if (!(await requireOrganizerPage())) return null;
  return <DatosClient />;
}
