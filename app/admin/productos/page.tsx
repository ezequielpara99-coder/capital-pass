import { redirect } from "next/navigation";

import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import ProductosClient from "./productos-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminProductosPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const { data: products } = await admin
    .from("products")
    .select("id, name, category, brand, image_path")
    .is("organization_id", null)
    .order("category")
    .order("name");

  return <ProductosClient products={products ?? []} />;
}
