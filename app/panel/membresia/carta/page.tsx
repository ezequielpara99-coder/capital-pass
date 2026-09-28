import { requireOrganizerPage } from "../../../../lib/panel/organizer-page";
import CartaClient from "./carta-client";

export const dynamic = "force-dynamic";

export default async function CartaPage() {
  if (!(await requireOrganizerPage())) return null;
  return <CartaClient />;
}
