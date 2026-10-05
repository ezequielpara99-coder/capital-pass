import { requireAdminPage } from "../../../../lib/quotes/auth";
import MensualClient from "./mensual-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminFinanzasMensualPage() {
  await requireAdminPage();
  return <MensualClient />;
}
