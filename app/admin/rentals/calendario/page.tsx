import { requireAdminPage } from "../../../../lib/quotes/auth";
import CalendarioClient from "./calendario-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CalendarioRentalPage() {
  await requireAdminPage();
  return <CalendarioClient />;
}
