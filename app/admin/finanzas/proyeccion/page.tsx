import { requireAdminPage } from "../../../../lib/quotes/auth";
import ProyeccionClient from "./proyeccion-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProyeccionPage() {
  await requireAdminPage();
  return <ProyeccionClient />;
}
