import { requireAdminPage } from "../../../../lib/quotes/auth";
import MensualesClient from "./mensuales-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminMensualesPage() {
  await requireAdminPage();
  return <MensualesClient />;
}
