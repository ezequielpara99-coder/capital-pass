import { requireOrganizerPage } from "../../../../lib/panel/organizer-page";
import PedidosClient from "./pedidos-client";

export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  if (!(await requireOrganizerPage())) return null;
  return <PedidosClient />;
}
