import { requireAdminPage } from "../../../../lib/quotes/auth";
import CierresClient from "./cierres-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminCierresPage() {
  await requireAdminPage();
  return <CierresClient />;
}
