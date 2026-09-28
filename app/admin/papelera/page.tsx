import { requireAdminPage } from "../../../lib/quotes/auth";
import PapeleraClient from "./papelera-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PapeleraPage() {
  await requireAdminPage();
  return <PapeleraClient />;
}
