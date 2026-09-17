import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { accountFor } from "../../../lib/billing/server";
import PerfilClient from "./perfil-client";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "organizer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/panel");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("first_name, last_name, phone, avatar_path")
    .eq("id", user.id)
    .maybeSingle();

  const account = await accountFor(user).catch(() => null);

  return (
    <PerfilClient
      firstName={profile?.first_name ?? ""}
      lastName={profile?.last_name ?? ""}
      phone={profile?.phone ?? ""}
      avatarPath={profile?.avatar_path ?? null}
      email={user.email ?? ""}
      organizationName={account?.organizationName ?? "Mi organización"}
      subscriptionActive={account?.active ?? false}
      periodEnd={account?.periodEnd ?? null}
      mpStatus={account?.signup?.mp_status ?? null}
    />
  );
}
