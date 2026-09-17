import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import ReclamosClient from "./reclamos-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminReclamosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: adminAccess, error: adminAccessError } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const fallbackAdminEmails = ["ezequiel.para99@gmail.com"];
  const isFallbackAdmin = Boolean(user.email && fallbackAdminEmails.includes(user.email.toLowerCase()));

  if ((adminAccessError || !adminAccess) && !isFallbackAdmin) {
    redirect("/admin");
  }

  const { data: complaints } = await admin
    .from("complaints")
    .select("id, organization_id, subject, message, status, admin_response, created_at, resolved_at")
    .order("created_at", { ascending: false });

  const organizationIds = [...new Set((complaints ?? []).map((c) => c.organization_id))];
  const { data: organizations } = organizationIds.length
    ? await admin.from("organizations").select("id, name").in("id", organizationIds)
    : { data: [] as { id: string; name: string }[] };
  const orgNameById = new Map((organizations ?? []).map((o) => [o.id, o.name]));

  const items = (complaints ?? []).map((c) => ({ ...c, organizationName: orgNameById.get(c.organization_id) ?? "—" }));

  return <ReclamosClient complaints={items} />;
}
