import { requireAdminPage } from "../../../lib/quotes/auth";
import FinanzasClient from "./finanzas-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminFinanzasPage() {
  await requireAdminPage();
  return <FinanzasClient />;
}
