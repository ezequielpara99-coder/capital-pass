import { requireAdminPage } from "../../../../lib/quotes/auth";
import CobrosClient from "./cobros-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminCobrosPage() {
  await requireAdminPage();
  return <CobrosClient />;
}
