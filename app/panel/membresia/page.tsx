import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import MembresiaClient from "./membresia-client";

export default async function MembresiaPage() {
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

  if (!membership) return null;

  return <MembresiaClient />;
}
