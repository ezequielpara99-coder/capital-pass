import type { MetadataRoute } from "next";
import { createAdminClient } from "../lib/supabase/admin";
import { getAppBaseUrl } from "../lib/mercadopago/server";

// Landing + paginas publicas de evento (activos o proximos, con slug). Los
// eventos finalizados o cancelados no aportan nada indexados, asi que se
// dejan afuera.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getAppBaseUrl();
  const admin = createAdminClient();

  const { data: events } = await admin
    .from("events")
    .select("slug, updated_at")
    .in("status", ["upcoming", "active"])
    .not("slug", "is", null);

  const eventEntries: MetadataRoute.Sitemap = (events ?? [])
    .filter((event) => event.slug)
    .map((event) => ({
      url: `${baseUrl}/e/${event.slug}`,
      lastModified: event.updated_at ? new Date(event.updated_at) : undefined,
      changeFrequency: "daily",
      priority: 0.8,
    }));

  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    ...eventEntries,
  ];
}
