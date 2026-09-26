import { requireAdminPage } from "../../../lib/quotes/auth";
import BuscarClient from "./buscar-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BuscarPage() {
  await requireAdminPage();
  return <BuscarClient />;
}
