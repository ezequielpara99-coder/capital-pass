import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import RentalsClient from "./rentals-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminRentalsPage() {
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

  const { data: inquiries } = await admin
    .from("rental_inquiries")
    .select("id, business_name, contact_name, phone, email, city, terminal_quantity, message, status, created_at")
    .order("created_at", { ascending: false });

  return <RentalsClient inquiries={inquiries ?? []} />;
}
